import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



/**
 * sync-lsa-leads — Fetches Google Local Services Ads leads via Google Ads API
 * and upserts them into the leads table. Triggered every 15 min via pg_cron.
 */

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + claims
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

  // Import RSA private key
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

  // Exchange JWT for access token
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    throw new Error(`Token exchange failed: ${tokenResp.status} ${errText}`);
  }

  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for mode
    let mode = "regular";
    let startDate = "";
    let endDate = "";
    try {
      const body = await req.json();
      mode = body?.mode || "regular";
      startDate = body?.start_date || "2024-01-01";
      endDate = body?.end_date || new Date().toISOString().split("T")[0];
    } catch {
      // No body (cron call) — default to regular
    }

    const isHistorical = mode === "historical";

    const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID")?.replace(/-/g, "");
    const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, "");

    if (!devToken || !saJson || !customerId) {
      throw new Error("Missing Google Ads credentials");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = getSupabaseAdmin();

    // Get access token
    const accessToken = await getAccessToken(saJson);

    // Build date filter and limit based on mode
    const dateFilter = isHistorical
      ? `BETWEEN '${startDate}' AND '${endDate}'`
      : "DURING LAST_7_DAYS";
    const queryLimit = isHistorical ? 1000 : 100;

    const query = `
      SELECT
        local_services_lead.id,
        local_services_lead.category_id,
        local_services_lead.service_id,
        local_services_lead.contact_details,
        local_services_lead.lead_type,
        local_services_lead.lead_status,
        local_services_lead.creation_date_time,
        local_services_lead.locale
      FROM local_services_lead
      WHERE local_services_lead.creation_date_time ${dateFilter}
      ORDER BY local_services_lead.creation_date_time DESC
      LIMIT ${queryLimit}
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    };
    // If using a manager (MCC) account, set login-customer-id
    if (loginCustomerId) {
      headers["login-customer-id"] = loginCustomerId;
    }

    const searchResp = await fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      }
    );

    if (!searchResp.ok) {
      const errText = await searchResp.text();
      console.error("Google Ads API error:", searchResp.status, errText);
      throw new Error(`Google Ads API: ${searchResp.status}`);
    }

    const searchData = await searchResp.json();
    const results = searchData?.[0]?.results || [];
    console.log(`Fetched ${results.length} LSA leads`);

    let inserted = 0;
    let skipped = 0;

    for (const row of results) {
      const lead = row.localServicesLead;
      if (!lead) continue;

      const lsaId = lead.id;
      const contact = lead.contactDetails || {};
      const phone = contact.phoneNumber || null;
      const email = contact.email || null;
      const firstName = contact.consumerName?.split(" ")[0] || null;
      const lastName = contact.consumerName?.split(" ").slice(1).join(" ") || null;
      const postalCode = contact.postalCode || null;
      const customerNote = lead.note || null;
      const googleLeadStatus = lead.leadStatus || null;
      const createdAt = lead.creationDateTime || null;

      // Check for existing lead
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("lsa_lead_id", lsaId)
        .maybeSingle();

      if (existing) {
        // Update existing lead with correct date and payload if missing
        const updateFields: Record<string, any> = {
          created_at: createdAt || undefined,
          raw_payload: lead,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
        };
        await supabase
          .from("leads")
          .update(updateFields)
          .eq("id", existing.id);

        // Re-run customer matching if not yet linked
        const { data: existingLead } = await supabase
          .from("leads")
          .select("customer_id")
          .eq("id", existing.id)
          .single();

        if (!existingLead?.customer_id && phone) {
          const normalizedDigits = phone.replace(/\D/g, "").slice(-10);
          if (normalizedDigits.length === 10) {
            const { data: matchedCustomer } = await supabase
              .rpc("find_customer_by_phone", { digits: normalizedDigits })
              .limit(1)
              .maybeSingle();
            if (matchedCustomer) {
              await supabase
                .from("leads")
                .update({ customer_id: matchedCustomer.id })
                .eq("id", existing.id);

              // Add "LSA Lead" tag
              const { data: custRow } = await supabase
                .from("customers")
                .select("tags")
                .eq("id", matchedCustomer.id)
                .single();
              const existingTags: string[] = custRow?.tags || [];
              if (!existingTags.includes("LSA Lead")) {
                await supabase
                  .from("customers")
                  .update({ tags: [...existingTags, "LSA Lead"] })
                  .eq("id", matchedCustomer.id);
              }
            }
          }
        }

        skipped++;
        continue;
      }

      // Build notes from available details
      const notesParts: string[] = [];
      if (customerNote) notesParts.push(customerNote);
      if (postalCode) notesParts.push(`ZIP: ${postalCode}`);
      if (googleLeadStatus) notesParts.push(`Google Status: ${googleLeadStatus}`);

      // Insert new lead with full payload
      const { error: insertErr } = await supabase.from("leads").insert({
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        source: "google_lsa",
        status: "new",
        lsa_lead_id: lsaId,
        lsa_lead_type: lead.leadType?.toLowerCase() || "unknown",
        lsa_category: lead.categoryId || null,
        lsa_charged: false,
        notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
        raw_payload: lead,
        created_at: createdAt,
      });

      if (insertErr) {
        console.error(`Failed to insert LSA lead ${lsaId}:`, insertErr);
        continue;
      }

      inserted++;

      // Match lead to existing customer by phone
      if (phone) {
        const normalizedDigits = phone.replace(/\D/g, "").slice(-10);
        if (normalizedDigits.length === 10) {
          const { data: matchedCustomer } = await supabase
            .rpc("find_customer_by_phone", { digits: normalizedDigits })
            .limit(1)
            .maybeSingle();
          if (matchedCustomer) {
            await supabase
              .from("leads")
              .update({ customer_id: matchedCustomer.id })
              .eq("lsa_lead_id", lsaId);

            // Add "LSA Lead" tag to the matched customer
            const { data: custRow } = await supabase
              .from("customers")
              .select("tags")
              .eq("id", matchedCustomer.id)
              .single();
            const existingTags: string[] = custRow?.tags || [];
            if (!existingTags.includes("LSA Lead")) {
              await supabase
                .from("customers")
                .update({ tags: [...existingTags, "LSA Lead"] })
                .eq("id", matchedCustomer.id);
            }
          }
        }
      }

      // NOTE: Warm-intro SMS intentionally removed.
      // The centralized SMS pipeline (handle-incoming-sms / lead automations)
      // already greets new leads with time-of-day-aware messaging, so sending
      // from here caused duplicate or after-hours messages.
    }

    console.log(`LSA sync complete: ${inserted} inserted, ${skipped} skipped`);

    return new Response(
      JSON.stringify({ success: true, inserted, skipped, total: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-lsa-leads error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
