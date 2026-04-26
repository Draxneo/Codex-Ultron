import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



/**
 * update-lsa-lead-status — Syncs CRM status changes to Google LSA
 * 
 * NOTE: Google Ads API does NOT support directly changing LSA lead status
 * (lead_status is read-only). The "MARK BOOKED" action is only available
 * in the LSA portal UI. Instead, we use AppendLeadConversation to add a
 * note so the status change is visible in Google's lead timeline.
 */

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/adwords",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    sub: sa.client_email,
  };

  const enc = (obj: any) => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  const unsignedToken = `${enc(header)}.${enc(claims)}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsignedToken}.${sigBase64}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    throw new Error(`Token exchange failed: ${tokenResp.status}`);
  }

  return (await tokenResp.json()).access_token;
}

// Map CRM status → human-readable message for Google conversation log
const STATUS_MESSAGES: Record<string, string> = {
  contacted: "Lead contacted via CRM",
  converted: "Lead converted/booked via CRM",
  lost: "Lead marked as lost via CRM",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, status } = await req.json();

    if (!lead_id || !status) {
      return new Response(
        JSON.stringify({ error: "lead_id and status required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

            const supabase = getSupabaseAdmin();

    // Get the lead's LSA ID
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("lsa_lead_id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadErr || !lead?.lsa_lead_id) {
      return new Response(
        JSON.stringify({ error: "Lead not found or not an LSA lead" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = STATUS_MESSAGES[status];
    if (!message) {
      return new Response(
        JSON.stringify({ success: true, message: "No Google sync needed for this status" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID")?.replace(/-/g, "");
    const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, "");

    if (!devToken || !saJson || !customerId) {
      throw new Error("Missing Google Ads credentials");
    }

    const accessToken = await getAccessToken(saJson);

    const resourceName = `customers/${customerId}/localServicesLeads/${lead.lsa_lead_id}`;
    
    const apiHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    };
    if (loginCustomerId) {
      apiHeaders["login-customer-id"] = loginCustomerId;
    }

    // Use AppendLeadConversation to log the status change in Google's lead timeline
    // This is the only write operation Google supports for LSA leads via API
    const appendResp = await fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}/localServices:appendLeadConversation`,
      {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          conversations: [
            {
              lead: resourceName,
              messageDetails: {
                text: message,
              },
            },
          ],
        }),
      }
    );

    if (!appendResp.ok) {
      const errText = await appendResp.text();
      console.error("Google LSA appendLeadConversation failed:", appendResp.status, errText);
      // Best-effort — don't fail the CRM update
    } else {
      console.log(`LSA lead ${lead.lsa_lead_id}: appended conversation note "${message}"`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        note: "Google LSA lead_status is read-only via API. A conversation note was appended instead. To mark as Booked in Google, use the LSA portal.",
        message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-lsa-lead-status error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
