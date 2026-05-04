/**
 * send-push — Deliver push notifications via Firebase Cloud Messaging V1 API
 *
 * Uses FCM HTTP V1 (not the deprecated legacy API).
 * Requires FIREBASE_SERVICE_ACCOUNT secret — the full JSON content
 * of a Firebase service account key file.
 *
 * Call with: { user_id, title, body?, data? }
 */

import { encode as base64url } from "https://deno.land/std@0.208.0/encoding/base64url.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { pageOnCall, logSystemError } from "../_shared/resilience.ts";



// ─── Generate OAuth2 access token from service account JSON ──────────────────
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Build the JWT header + claim set
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: object) =>
    base64url(new TextEncoder().encode(JSON.stringify(obj)));

  const headerB64 = encode(header);
  const claimB64 = encode(claim);
  const signingInput = `${headerB64}.${claimB64}`;

  // Import the private key
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign it
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = base64url(new Uint8Array(sig));
  const jwt = `${signingInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, data } = await req.json();
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get service account JSON from secret
    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountRaw) {
      return new Response(JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccount = JSON.parse(serviceAccountRaw);
    const projectId = serviceAccount.project_id;

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);

    // Get all push tokens for this user from Supabase
    const supabase = getSupabaseAdmin();

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token, platform")
      .eq("user_id", user_id);

    if (error || !tokens?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no tokens for user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    const staleTokens: string[] = [];

    // Send to each device token
    for (const t of tokens) {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: { title, body: body || "" },
                data: data
                  ? Object.fromEntries(
                      Object.entries(data).map(([k, v]) => [k, String(v)])
                    )
                  : {},
                android: {
                  priority: "high",
                  notification: { sound: "default", channel_id: "organize_plus" },
                },
              },
            }),
          }
        );

        const result = await res.json();
        if (res.ok) {
          sent++;
        } else {
          const errCode = result?.error?.details?.[0]?.errorCode;
          if (errCode === "UNREGISTERED" || errCode === "INVALID_ARGUMENT") {
            staleTokens.push(t.token);
          }
          console.error("FCM V1 error:", JSON.stringify(result));
        }
      } catch (err) {
        console.error("FCM send error:", err);
      }
    }

    // Clean up stale/invalid tokens
    if (staleTokens.length > 0) {
      await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user_id)
        .in("token", staleTokens);
    }

    return new Response(JSON.stringify({ sent, total: tokens.length, stale_removed: staleTokens.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-push error:", err);
    // FCM auth/config blowups silently kill all native notifications — page admin.
    try {
      const supabase = getSupabaseAdmin();
      const msg = String((err as Error)?.message ?? err);
      await logSystemError(supabase, {
        source_name: "send-push",
        error_message: msg,
        severity: "critical",
        stack_trace: (err as Error)?.stack ?? null,
      });
      // Only page on auth/config failures, not per-token send errors (those are common)
      if (msg.includes("access_token") || msg.includes("FIREBASE_SERVICE_ACCOUNT") || msg.includes("private_key")) {
        await pageOnCall(supabase, {
          service: "send-push",
          summary: "FCM auth broken",
          body: msg.slice(0, 200),
          severity: "critical",
        });
      }
    } catch (e) {
      console.error("pageOnCall failed:", e);
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
