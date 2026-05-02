import { formatDateFriendly, formatTimeWindow } from "../_shared/formatters.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";



/** Build the SMS body for a job reminder */
function buildReminderSms(job: any, dateLabel: string): string {
  const firstName = job.customer_name?.split(" ")[0] || "there";
  let timeWindow = "";
  if (job.arrival_start && job.arrival_end) {
    timeWindow = ` between ${formatTimeWindow(job.arrival_start, job.arrival_end)}`;
  }
  const typeLabel = (job.job_type || "service").replace("_", " ");
  const isPhoneCall = job.job_type === "phone_call";
  const friendlyDate = formatDateFriendly(job.scheduled_date);
  const companyName = job.company_name || "{{company_name}}";

  if (isPhoneCall) {
    return `Hi ${firstName}, just a reminder from ${companyName}: we'll be calling you${friendlyDate ? ` on ${friendlyDate}` : ""}${timeWindow}. Reply R if you need to reschedule.`;
  }
  return `Hi ${firstName}, this is a friendly reminder from ${companyName} that your ${typeLabel} appointment is ${dateLabel}${friendlyDate ? ` (${friendlyDate})` : ""}${timeWindow}. You'll get a 30-minute heads up when we're on the way. Reply C to confirm, R to reschedule, or send any gate code, pet note, or access instructions here.`;
}

async function buildReminderSmsFromTemplate(
  supabase: any,
  job: any,
  dateLabel: string,
  templateKey = "appointment_reminder_day_before",
): Promise<{ body: string; templateKey: string | null }> {
  const fallbackBody = buildReminderSms(job, dateLabel);
  const resolved = await resolveSmsTemplateBody({
    supabase,
    templateKey,
    fallbackBody,
    job,
    businessUnitId: job?.business_unit_id || null,
    extraVars: { date_label: dateLabel },
  });
  return { body: resolved.body.trim(), templateKey: resolved.templateKey };
}

/** Send SMS for a single job, update job_reminders */
async function sendReminderForJob(
  supabase: any,
  jobId: string,
  dateLabel: string,
): Promise<boolean> {
  const { data: job } = await supabase.from("jobs")
    .select("customer_name, customer_phone, customer_email, customer_id, scheduled_date, job_type, address, arrival_start, arrival_end, business_unit_id")
    .eq("id", jobId).single();

  if (!job?.customer_phone) return false;

  const { body: smsBody, templateKey } = await buildReminderSmsFromTemplate(supabase, job, dateLabel);

  const smsResult = await supabase.functions.invoke("send-sms", {
    body: { to: job.customer_phone, body: smsBody, job_id: jobId, template_key: templateKey },
    headers: { "x-source-function": "job-reminders", "x-hitl-approved": "true" },
  });
  if (smsResult.error) {
    console.error(`Failed to send reminder for job ${jobId}:`, smsResult.error);
    return false;
  }

  let smsData: any = {};
  try { smsData = typeof smsResult.data === "string" ? JSON.parse(smsResult.data) : smsResult.data || {}; } catch { /* ignore malformed SMS response */ }
  const wasBlocked = smsData?.queued === true || smsData?.blocked === true;

  if (!wasBlocked) {
    await supabase.from("jobs").update({
      confirmation_sent_at: new Date().toISOString(),
    } as any).eq("id", jobId);
  }

  // Update job_reminders status
  await supabase.from("job_reminders")
    .update({ status: wasBlocked ? "queued" : "sent", sent_at: wasBlocked ? null : new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "pending");

  return !wasBlocked;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const supabase = getSupabaseAdmin();

    let body: any = {};
    try { body = await req.json(); } catch { /* cron calls with no body */ }

    const manualJobId = body?.manual_job_id || null;
    const batchJobIds: string[] = body?.batch_job_ids || [];

    // ─── Path 1: Manual single-job reminder (booking confirmation) ───
    if (manualJobId) {
      const { data: job } = await supabase.from("jobs")
        .select("customer_name, customer_phone, customer_email, customer_id, scheduled_date, job_type, address, arrival_start, arrival_end, business_unit_id")
        .eq("id", manualJobId).single();

      if (!job?.customer_phone) {
        return new Response(JSON.stringify({ error: "No phone number" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }

      const friendlyDate = formatDateFriendly(job.scheduled_date);
      const { body: smsBody, templateKey } = await buildReminderSmsFromTemplate(
        supabase,
        job,
        friendlyDate ? `on ${friendlyDate}` : "soon",
        "appointment_confirmation",
      );

      const smsResult = await supabase.functions.invoke("send-sms", {
        body: { to: job.customer_phone, body: smsBody, job_id: manualJobId, template_key: templateKey },
        headers: { "x-source-function": "job-reminders", "x-hitl-approved": "true" },
      });
      if (smsResult.error) throw smsResult.error;

      let smsData: any = {};
      try { smsData = typeof smsResult.data === "string" ? JSON.parse(smsResult.data) : smsResult.data || {}; } catch { /* ignore malformed SMS response */ }
      const wasBlocked = smsData?.queued === true || smsData?.blocked === true;

      if (!wasBlocked) {
        await supabase.from("jobs").update({
          confirmation_sent_at: new Date().toISOString(),
        } as any).eq("id", manualJobId);
      }

      return new Response(JSON.stringify({ sent: wasBlocked ? 0 : 1, queued: wasBlocked, manual: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Path 2: Batch send (triggered by dispatcher clicking "Send All") ───
    if (batchJobIds.length > 0) {
      let sentCount = 0;
      for (const jobId of batchJobIds) {
        const sent = await sendReminderForJob(supabase, jobId, "tomorrow");
        if (sent) sentCount++;
      }
      return new Response(JSON.stringify({ sent: sentCount, batch: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Path 3: Cron — surface action_item card, do NOT auto-send ───

    // Check if reminders are enabled
    const { data: setting } = await supabase.from("company_settings")
      .select("value").eq("key", "reminders_enabled").single();
    if (setting?.value === "false") {
      return new Response(JSON.stringify({ skipped: true, reason: "reminders disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute tomorrow's date range in America/Chicago (CST/CDT)
    const nowChicago = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const tomorrowDate = new Date(nowChicago);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

    // Expire any stale pending reminders for jobs already in the past
    const todayStr = `${nowChicago.getFullYear()}-${String(nowChicago.getMonth() + 1).padStart(2, "0")}-${String(nowChicago.getDate()).padStart(2, "0")}`;
    await supabase.from("job_reminders")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("scheduled_for", new Date(todayStr + "T00:00:00Z").toISOString());

    // Get pending reminders only for tomorrow's jobs
    const { data: reminders } = await supabase.from("job_reminders")
      .select("*, jobs!inner(scheduled_date, customer_name, customer_phone, job_type, arrival_start, arrival_end)")
      .eq("status", "pending")
      .eq("jobs.scheduled_date", tomorrowStr)
      .limit(50);

    if (!reminders?.length) {
      return new Response(JSON.stringify({ sent: 0, card: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedup: check if we already created a reminder_batch action_item today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: existingCard } = await supabase.from("action_items")
      .select("id")
      .eq("category", "reminder_batch")
      .eq("status", "pending")
      .gte("created_at", todayStart.toISOString())
      .limit(1);

    if (existingCard && existingCard.length > 0) {
      return new Response(JSON.stringify({ sent: 0, card: false, reason: "card already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build preview list
    const previews: any[] = [];
    for (const reminder of reminders) {
      const job = (reminder as any).jobs;
      if (!job?.customer_phone) continue;

      previews.push({
        jobId: reminder.job_id,
        customerName: job.customer_name || "Unknown",
        phone: job.customer_phone,
        smsPreview: (await buildReminderSmsFromTemplate(supabase, job, "tomorrow")).body,
      });
    }

    if (previews.length === 0) {
      return new Response(JSON.stringify({ sent: 0, card: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert action_item for dispatcher to review
    await supabase.from("action_items").insert({
      title: `Send Tomorrow's Appointment Reminders (${previews.length})`,
      description: JSON.stringify(previews),
      category: "reminder_batch",
      source: "jarvis",
      priority: "medium",
      status: "pending",
    });

    console.log(`Created reminder batch card with ${previews.length} job previews`);

    return new Response(JSON.stringify({ sent: 0, card: true, count: previews.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-job-reminders error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
