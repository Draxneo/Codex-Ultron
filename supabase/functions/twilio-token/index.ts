import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { corsHeaders } from "../_shared/cors.ts";



async function generateToken(identity: string, roomName?: string, pushCredentialSid?: string): Promise<string> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const apiKey = Deno.env.get("TWILIO_API_KEY")!;
  const apiSecret = Deno.env.get("TWILIO_API_SECRET")!;
  const twimlAppSid = Deno.env.get("TWILIO_TWIML_APP_SID")!;

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    throw new Error("Missing Twilio configuration secrets");
  }

  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const now = Math.floor(Date.now() / 1000);

  const voiceGrant: Record<string, any> = {
    incoming: { allow: true },
    outgoing: { application_sid: twimlAppSid },
  };

  // Add push credential for native mobile SDK (FCM/APNs)
  if (pushCredentialSid) {
    voiceGrant.push_credential_sid = pushCredentialSid;
  }

  const grants: Record<string, any> = {
    identity,
    voice: voiceGrant,
  };

  // Add video grant for huddles/screen share
  if (roomName) {
    grants.video = { room: roomName };
  }

  const payload = {
    jti: `${apiKey}-${now}`,
    iss: apiKey,
    sub: accountSid,
    exp: now + 3600,
    grants,
  };

  const enc = new TextEncoder();
  const b64url = (data: Uint8Array) =>
    base64Encode(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64urlStr = (s: string) => b64url(enc.encode(s));

  const headerB64 = b64urlStr(JSON.stringify(header));
  const payloadB64 = b64urlStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse optional parameters
    let room: string | undefined;
    let platform: string | undefined;
    try {
      const body = await req.json();
      room = body?.room;
      platform = body?.platform; // "android" or "ios" for native push credential
    } catch {
      // No body or not JSON — that's fine
    }

    // Include push credential SID for native mobile clients (FCM/APNs)
    let pushCredentialSid: string | undefined;
    if (platform === "android") {
      pushCredentialSid = Deno.env.get("TWILIO_PUSH_CREDENTIAL_SID_FCM") || undefined;
    } else if (platform === "ios") {
      pushCredentialSid = Deno.env.get("TWILIO_PUSH_CREDENTIAL_SID_APNS") || undefined;
    }

    const identity = `user_${user.id.replace(/-/g, "")}`;
    console.log(`twilio-token: platform=${platform}, identity=${identity}, pushCredSid=${pushCredentialSid ? "set" : "NOT SET"}, room=${room || "none"}`);
    const accessToken = await generateToken(identity, room, pushCredentialSid);

    return new Response(JSON.stringify({ token: accessToken, identity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("twilio-token error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
