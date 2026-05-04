import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Cart recovery automation.
 * Runs on a cron schedule. Finds carts that:
 *   - status = 'sent'
 *   - sent_at older than 24h
 *   - recovery_sms_sent_at IS NULL
 *   - have a customer phone on the linked job
 * Sends a single, branded nudge SMS via the centralized send-sms pipeline,
 * then stamps recovery_sms_sent_at so we never double-nudge.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: carts, error } = await supabase
      .from("job_carts")
      .select("id, job_id, public_token, total, sent_at, jobs:job_id(customer_phone, customer_name)")
      .eq("status", "sent")
      .is("recovery_sms_sent_at", null)
      .lt("sent_at", cutoff)
      .limit(50);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const c of carts || []) {
      const job = (c as any).jobs;
      const phone = job?.customer_phone as string | null | undefined;
      if (!phone) { skipped++; continue; }

      const firstName = (job?.customer_name as string | null | undefined)?.split(" ")[0];
      const greeting = firstName ? `Hi ${firstName}, ` : "";
      const appUrl = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://codex-ultron.onrender.com";
      const link = `${appUrl}/cart/${c.public_token}`;
      const message = `${greeting}just checking in on your quote ($${Number(c.total).toFixed(2)}). Any questions we can answer? Reply here or view it again: ${link}`;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "x-source-function": "cart-recovery-cron",
          "x-hitl-approved": "true",
        },
        body: JSON.stringify({ to: phone, message, job_id: c.job_id }),
      });

      const respJson = await resp.json().catch(() => ({}));
      results.push({ cart_id: c.id, ok: resp.ok, status: resp.status, body: respJson });

      if (resp.ok) {
        await supabase.from("job_carts").update({ recovery_sms_sent_at: new Date().toISOString() }).eq("id", c.id);
        await supabase.from("activity_log").insert({
          job_id: c.job_id,
          action: "cart_recovery_sms_sent",
          details: `24h cart recovery nudge sent to ${phone}.`,
        });
        sent++;
      } else {
        skipped++;
      }
    }

    return new Response(JSON.stringify({ ok: true, scanned: carts?.length || 0, sent, skipped, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("cart-recovery-cron error", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
