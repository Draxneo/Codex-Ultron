// Drafts SMS to all customers scheduled on a rain day, queuing each through
// the centralized send-sms HITL pipeline so dispatchers approve every message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadCompanyInfo } from "../_shared/companyInfo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function generateCode(date: string): string {
  // RAINDAY-MMDD format
  const [, m, d] = date.split("-");
  return `RAINDAY-${m}${d}`;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { date } = await req.json();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: "date YYYY-MM-DD required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull company info + template
    const company = await loadCompanyInfo(supabase);
    const { data: tmplRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "rain_day_sms_template")
      .maybeSingle();

    const template = (tmplRow?.value as string) ||
      "Hi {first_name}, {company_name} here. Heavy rain is forecast for {day} which may delay your {job_type} appointment. Want to reschedule? Reply YES — plus use code {code} for $25 off your next repair.";

    // Generate or reuse code for this date
    const code = generateCode(date);
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 90);

    // Pull jobs for this date with phone, not done/canceled
    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, customer_id, customer_name, customer_phone, job_type, scheduled_date, status")
      .eq("scheduled_date", date)
      .not("customer_phone", "is", null)
      .not("status", "in", "(done,invoiced,canceled)");

    if (jobsErr) throw jobsErr;

    const targets = (jobs || []).filter(j => j.customer_phone);

    // Friendly date string e.g. "Tue Apr 21"
    const d = new Date(`${date}T12:00:00`);
    const dayLabel = d.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago",
    });

    // Upsert the code row
    await supabase.from("weather_sms_codes").upsert({
      code,
      forecast_date: date,
      jobs_targeted: targets.length,
      valid_until: validUntil.toISOString().substring(0, 10),
    }, { onConflict: "code" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    let queued = 0;
    for (const job of targets) {
      const firstName = (job.customer_name || "there").split(" ")[0];
      const body = fillTemplate(template, {
        first_name: firstName,
        company_name: company.name || "your team",
        day: dayLabel,
        job_type: job.job_type || "service",
        code,
      });

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
            "x-hitl-approved": "false", // Force dispatcher review
          },
          body: JSON.stringify({
            to: job.customer_phone,
            body,
            source: "rain_day_blast",
            job_id: job.id,
            metadata: { code, forecast_date: date },
          }),
        });
        if (res.ok) queued++;
      } catch (e) {
        console.error("[draft-rain-day-sms] send failed", job.id, e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, queued, total: targets.length, code }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[draft-rain-day-sms]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
