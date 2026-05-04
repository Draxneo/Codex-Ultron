/**
 * facebook-lead-webhook — Receives Facebook Lead Ads form submissions.
 *
 * Facebook sends a webhook when someone fills out a lead form.
 * This function:
 * 1. Inserts the lead into the `leads` table
 * 2. Triggers JARVIS to send a warm intro SMS
 * 3. Returns 200 so Facebook stops retrying
 *
 * Also handles Facebook's GET verification challenge.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = getSupabaseAdmin();

  // ── Facebook verification challenge (GET) ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Load verify token from company_settings
    const { data: setting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "facebook_verify_token")
      .maybeSingle();

    const verifyToken = setting?.value || "cs-ultra-leads";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[FB Lead] Verification challenge accepted");
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // ── POST: Incoming lead data ──
  try {
    const payload = await req.json();
    console.log("[FB Lead] Incoming payload:", JSON.stringify(payload));

    // Facebook sends { entry: [{ changes: [{ value: { ... } }] }] }
    const entries = payload.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== "leadgen") continue;

        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;
        const pageId = change.value?.page_id;

        // We need to fetch the actual lead data from Facebook Graph API
        // For now, store what we have and parse fields if provided
        const fieldData = change.value?.field_data || [];
        
        let firstName = "";
        let lastName = "";
        let phone = "";
        let email = "";

        for (const field of fieldData) {
          const name = (field.name || "").toLowerCase();
          const values = field.values || [];
          const val = values[0] || "";

          if (name.includes("first_name") || name === "first name") firstName = val;
          else if (name.includes("last_name") || name === "last name") lastName = val;
          else if (name.includes("full_name") || name === "full name") {
            const parts = val.split(" ");
            firstName = parts[0] || "";
            lastName = parts.slice(1).join(" ") || "";
          }
          else if (name.includes("phone") || name.includes("number")) phone = val;
          else if (name.includes("email")) email = val;
        }

        // Insert lead
        const { data: lead, error: insertErr } = await supabase
          .from("leads")
          .insert({
            first_name: firstName || null,
            last_name: lastName || null,
            phone: phone || null,
            email: email || null,
            source: "facebook",
            status: "new",
            intent: "install_quote",
            raw_payload: { leadgen_id: leadgenId, form_id: formId, page_id: pageId, field_data: fieldData },
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[FB Lead] Insert error:", insertErr);
          continue;
        }

        console.log("[FB Lead] Lead inserted:", lead?.id);

        // Auto-send warm intro SMS if we have a phone number
        if (phone) {
          const normalizedPhone = phone.replace(/\D/g, "");
          const formattedPhone = normalizedPhone.length === 10 ? `+1${normalizedPhone}` : normalizedPhone.startsWith("1") ? `+${normalizedPhone}` : `+1${normalizedPhone}`;

          const displayName = firstName || "there";

          // Load company name
          const { data: companySetting } = await supabase
            .from("company_settings")
            .select("value")
            .eq("key", "company_name")
            .maybeSingle();
          const companyName = companySetting?.value || "CS Ultra";

          const introMessage = `Hey ${displayName}! 👋 This is ${companyName}. We got your request and would love to help! What's going on with your AC — looking for a repair, maintenance, or thinking about a new system?`;

          // Send SMS via send-sms function
          try {
            const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                to: formattedPhone,
                body: introMessage,
              }),
            });

            if (smsResp.ok) {
              // Mark as contacted
              await supabase
                .from("leads")
                .update({ status: "contacted", contacted_at: new Date().toISOString() })
                .eq("id", lead?.id);
              console.log("[FB Lead] Intro SMS sent to", formattedPhone);
            } else {
              console.error("[FB Lead] SMS send failed:", await smsResp.text());
            }
          } catch (smsErr) {
            console.error("[FB Lead] SMS error:", smsErr);
          }

          // Also create an action_item so the dispatcher sees it
          await supabase.from("action_items").insert({
            title: `New Facebook Lead: ${firstName} ${lastName}`.trim(),
            description: `Phone: ${phone}${email ? `, Email: ${email}` : ""}. JARVIS sent an intro text. Follow up if no reply.`,
            category: "new_lead",
            priority: "high",
            source: "jarvis",
            status: "pending",
            customer_phone: formattedPhone,
            metadata: { lead_id: lead?.id, source: "facebook" },
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[FB Lead] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
