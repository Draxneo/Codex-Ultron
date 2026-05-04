import { getCentralHour } from "../_shared/formatters.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



/**
 * run-lead-drip — Cron-triggered (every 5 min) drip sequence executor.
 * Queries leads where drip_next_at <= now(), executes the current step,
 * advances to next step or ends the drip.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Business-hours guard — don't text leads outside 8 AM–8 PM Central
  const { hour: cstHour, dayOfWeek } = getCentralHour();
  if (cstHour < 8 || cstHour >= 20 || dayOfWeek === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "outside business hours" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = getSupabaseAdmin();

    // Find leads ready for their next drip step
    const { data: dueLeads, error: queryErr } = await supabase
      .from("leads")
      .select("id, first_name, last_name, phone, email, status, drip_sequence_id, drip_step_index, drip_next_at")
      .not("drip_sequence_id", "is", null)
      .lte("drip_next_at", new Date().toISOString())
      .in("status", ["new", "contacted"])
      .limit(50);

    if (queryErr) throw queryErr;
    if (!dueLeads || dueLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load all referenced sequences
    const seqIds = [...new Set(dueLeads.map((l: any) => l.drip_sequence_id))];
    const { data: sequences } = await (supabase as any)
      .from("message_sequences")
      .select("id, steps")
      .in("id", seqIds);

    const seqMap: Record<string, any[]> = {};
    for (const seq of sequences || []) {
      seqMap[seq.id] = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps;
    }

    // Load company settings for template resolution
    const { data: settings } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", ["company_name", "company_phone"]);

    const companyName = settings?.find((s: any) => s.key === "company_name")?.value || "";
    const companyPhone = settings?.find((s: any) => s.key === "company_phone")?.value || "";

    let processed = 0;

    for (const lead of dueLeads as any[]) {
      const steps = seqMap[lead.drip_sequence_id];
      if (!steps) continue;

      let currentIndex = lead.drip_step_index || 0;

      // Find next actionable step starting from current index
      while (currentIndex < steps.length) {
        const step = steps[currentIndex];

        if (step.type === "end") {
          // End of sequence — clear drip
          await supabase
            .from("leads")
            .update({ drip_sequence_id: null, drip_step_index: null, drip_next_at: null, updated_at: new Date().toISOString() })
            .eq("id", lead.id);
          break;
        }

        if (step.type === "delay") {
          // Calculate next fire time from delay config
          const delayHours = (step.config?.hours || 0) + (step.config?.days || 0) * 24;
          const nextAt = new Date(Date.now() + delayHours * 3600 * 1000).toISOString();

          await supabase
            .from("leads")
            .update({ drip_step_index: currentIndex + 1, drip_next_at: nextAt, updated_at: new Date().toISOString() })
            .eq("id", lead.id);
          break;
        }

        if (step.type === "send_sms" && lead.phone) {
          // Resolve template variables
          let body = step.config?.body || "";
          body = body
            .replace(/\{\{first_name\}\}/g, lead.first_name || "")
            .replace(/\{\{last_name\}\}/g, lead.last_name || "")
            .replace(/\{\{company_name\}\}/g, companyName)
            .replace(/\{\{company_phone\}\}/g, companyPhone);

          // Send via centralized send-sms
          await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
              "x-source-function": "run-lead-drip",
            },
            body: JSON.stringify({ to: lead.phone, body }),
          });

          // Advance to next step
          currentIndex++;
          continue;
        }

        if (step.type === "send_email") {
          // In-app email sending is retired. Advance past legacy email steps.
          currentIndex++;
          continue;
        }

        // Skip unsupported step types
        currentIndex++;
      }

      processed++;
    }

    return new Response(
      JSON.stringify({ success: true, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-lead-drip error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
