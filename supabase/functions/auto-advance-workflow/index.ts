import { detectCentralOffset } from "../_shared/formatters.ts";
/**
 * auto-advance-workflow — Server-side autopilot chain.
 * 
 * Called after a tech submits a form or when any workflow step completes.
 * Checks if the next step(s) are auto_completable and fires them in sequence.
 * 
 * DETERMINISTIC EXECUTION: Steps with message_template are handled by a generic
 * template runner — loads template from DB, fills {{variables}}, validates
 * required_fields, and sends. No AI involved for Type 1 execution steps.
 * 
 * Steps without message_template fall through to special handlers (warranty,
 * rebate, inspection, etc.) that contain genuinely complex logic.
 */
import { resolveTemplate, loadCompanySettings, checkRequiredFields } from "../_shared/templateEngine.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, trigger_step } = await req.json();
    if (!job_id) throw new Error("job_id required");

            const supabase = getSupabaseAdmin();

    // Fetch the job
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);

    // Fetch workflow definition for this job type
    const { data: wfDef } = await supabase
      .from("workflow_definitions")
      .select("steps")
      .eq("job_type", job.job_type)
      .eq("is_active", true)
      .single();

    if (!wfDef) {
      console.log(`No workflow definition for job_type: ${job.job_type}`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const steps = typeof wfDef.steps === "string" ? JSON.parse(wfDef.steps) : wfDef.steps;
    const completedActions: string[] = [];
    const errors: string[] = [];

    // Find the current step index (first incomplete BLOCKING step)
    let currentIdx = -1;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Check skip conditions
      if (step.skip_when) {
        const fieldVal = job[step.skip_when.field];
        if (step.skip_when.value !== undefined && fieldVal === step.skip_when.value) continue;
        if (step.skip_when.not_value !== undefined && fieldVal !== step.skip_when.not_value) continue;
      }

      // Check if step is complete
      if (step.completion_check === "timestamp" && step.timestamp_field && job[step.timestamp_field]) continue;
      if (step.completion_check === "field_set" && step.field_check) {
        const val = job[step.field_check.field];
        if (step.field_check.value ? val === step.field_check.value : !!val) continue;
      }
      if (step.completion_check === "status") {
        const target = step.field_check?.value;
        const status = job.status || "new";
        if (target === "in_progress" && (status === "in_progress" || status === "done" || status === "invoiced")) continue;
        if (target && status === target) continue;
      }

      // Non-blocking steps: skip past them even if incomplete
      if (step.blocking === false) {
        console.log(`Skipping non-blocking step "${step.label}" — will complete in parallel`);
        continue;
      }

      currentIdx = i;
      break;
    }

    if (currentIdx === -1) {
      console.log(`All steps complete for job ${job_id}`);
      return new Response(JSON.stringify({ ok: true, all_complete: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process auto-completable steps in chain
    let idx = currentIdx;
    while (idx < steps.length) {
      const step = steps[idx];
      
      // Skip auto-skippable steps
      if (step.skip_when) {
        const fieldVal = job[step.skip_when.field];
        if (step.skip_when.value !== undefined && fieldVal === step.skip_when.value) { idx++; continue; }
        if (step.skip_when.not_value !== undefined && fieldVal !== step.skip_when.not_value) { idx++; continue; }
      }

      // If not auto-completable, stop the chain
      if (!step.auto_completable) {
        console.log(`Chain stopped at step "${step.label}" — requires human action`);
        break;
      }

      // Try to auto-complete this step
      try {
        const result = await autoCompleteStep(supabase, job, step, job_id);
        if (result.completed) {
          completedActions.push(step.label);
          // Update job reference for subsequent checks
          if (step.timestamp_field) {
            job[step.timestamp_field] = new Date().toISOString();
          }
          // Log activity
          await supabase.from("activity_log").insert({
            job_id,
            action: "auto_completed",
            performed_by: "Autopilot",
            details: `Auto-completed: "${step.label}" — ${result.detail || "success"}`,
          });
        } else {
          errors.push(`${step.label}: ${result.reason}`);
          // Log the failure
          await supabase.from("activity_log").insert({
            job_id,
            action: "auto_complete_failed",
            performed_by: "Autopilot",
            details: `Failed to auto-complete "${step.label}": ${result.reason}`,
          });
          break; // Stop chain on failure
        }
      } catch (e: any) {
        errors.push(`${step.label}: ${e.message}`);
        break;
      }

      idx++;
    }

    console.log(`Auto-advance for job ${job_id}: completed ${completedActions.length} steps, ${errors.length} errors`);

    return new Response(JSON.stringify({
      ok: true,
      job_id,
      completed: completedActions,
      errors,
      stopped_at: idx < steps.length ? steps[idx]?.label : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("auto-advance error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Attempt to auto-complete a single workflow step.
 * Returns { completed: true, detail } on success or { completed: false, reason } on failure.
 */
async function autoCompleteStep(
  supabase: any,
  job: any,
  step: any,
  jobId: string
): Promise<{ completed: boolean; detail?: string; reason?: string }> {
  const action = step.primary_action;

  // ═══════════════════════════════════════════════════════
  // GENERIC TEMPLATE HANDLER — Deterministic execution
  // If step has required_fields or message_template, handle it generically
  // before falling through to special-case handlers.
  // ═══════════════════════════════════════════════════════

  // Pre-flight validation
  if (step.required_fields?.length) {
    const missing = checkRequiredFields(job, step.required_fields);
    if (missing.length > 0) {
      const fallback = step.fallback_behavior || "block_chain";

      // Suppress SMS-related workflow alerts — these are noisy in HCP overlay mode
      const SMS_STEP_IDS = new Set([
        "confirmation", "send_confirmation", "dispatch", "send_dispatch",
        "send_eta", "eta", "review_request", "request_review",
        "follow_up_text", "complete_follow_up",
      ]);
      const suppressAlert = SMS_STEP_IDS.has(step.id);

      if (!suppressAlert) {
        // Log to workflow_alerts (only for non-SMS steps like permits, payments)
        await supabase.from("workflow_alerts").insert({
          job_id: jobId,
          step_id: step.id,
          alert_type: "blocked",
          details: `Pre-flight failed: missing ${missing.join(", ")}`,
          missing_fields: missing,
        });
      }

      if (fallback === "escalate") {
        // Log escalation to workflow_alerts (approval-alert function removed)
        await supabase.from("workflow_alerts").insert({
          job_id: jobId,
          step_id: step.id,
          alert_type: "escalated",
          details: `Workflow blocked at "${step.label}" — missing: ${missing.join(", ")}`,
        });
        return { completed: false, reason: `Blocked + escalated: missing ${missing.join(", ")}` };
      }

      if (fallback === "stamp_and_log") {
        // Stamp anyway with warning
        if (step.timestamp_field) {
          await supabase.from("jobs").update({ [step.timestamp_field]: new Date().toISOString() }).eq("id", jobId);
        }
        return { completed: true, detail: `Stamped with warning — missing: ${missing.join(", ")}` };
      }

      // Default: block_chain
      return { completed: false, reason: `Blocked: missing ${missing.join(", ")}` };
    }
  }

  // Template-based sending (deterministic — no AI)
  if (step.message_template) {
    try {
      // Load template from sms_templates by name match
      const { data: tpl } = await supabase
        .from("sms_templates")
        .select("template_body, name")
        .ilike("name", step.message_template.replace(/_/g, " ").replace(/%/g, ""))
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!tpl) {
        return { completed: false, reason: `Template "${step.message_template}" not found in sms_templates` };
      }

      // Load company settings for variable resolution
      const company = await loadCompanySettings(supabase, ["company_name", "company_phone"]);

      // Resolve recipient phone
      let recipientPhone: string | null = null;
      let employee: any = null;

      if (step.recipient_type === "customer") {
        recipientPhone = job.customer_phone;
      } else if (step.recipient_type === "tech") {
        if (job.assigned_to) {
          const { data: emp } = await supabase.from("employees")
            .select("phone, name")
            .ilike("name", `%${job.assigned_to.split(" ")[0]}%`)
            .limit(1)
            .maybeSingle();
          recipientPhone = emp?.phone || null;
          employee = emp;
        }
      } else if (step.recipient_type === "owner") {
        const ownerPhone = await loadCompanySettings(supabase, ["owner_phone"]);
        recipientPhone = ownerPhone.owner_phone || null;
      }

      if (!recipientPhone) {
        return { completed: false, reason: `No phone found for recipient_type "${step.recipient_type}"` };
      }

      // Resolve template variables
      const messageBody = resolveTemplate(tpl.template_body, job, company, employee);

      // Check scheduling — if send date is in the future, schedule via job_reminders
      if (step.scheduling && job[step.scheduling.relative_to]) {
        const relDate = job[step.scheduling.relative_to];
        const sendDate = new Date(relDate + `T${step.scheduling.time}:00${detectCentralOffset(relDate)}`);
        sendDate.setDate(sendDate.getDate() + step.scheduling.offset_days);

        if (sendDate > new Date()) {
          // Schedule for later
          const reminderType = step.id === "confirmation" ? "day_before" : step.id === "dispatch" ? "dispatch" : step.id;
          await supabase.from("job_reminders").upsert({
            job_id: jobId,
            reminder_type: reminderType,
            scheduled_for: sendDate.toISOString(),
            status: "pending",
          }, { onConflict: "job_id,reminder_type" });

          if (step.timestamp_field) {
            await supabase.from("jobs").update({ [step.timestamp_field]: sendDate.toISOString() }).eq("id", jobId);
          }

          // Log to workflow_alerts
          await supabase.from("workflow_alerts").insert({
            job_id: jobId,
            step_id: step.id,
            alert_type: "completed",
            details: `Scheduled "${tpl.name}" for ${sendDate.toISOString().split("T")[0]} to ${recipientPhone}`,
          });

          return { completed: true, detail: `"${tpl.name}" scheduled for ${sendDate.toISOString().split("T")[0]}` };
        }
      }

      // Send immediately
      const { error: smsErr } = await supabase.functions.invoke("send-sms", {
        body: { to: recipientPhone, body: messageBody, job_id: jobId },
        headers: { "x-source-function": "auto-advance-workflow" },
      });

      if (smsErr) {
        return { completed: false, reason: `SMS send failed: ${smsErr.message}` };
      }

      if (step.timestamp_field) {
        await supabase.from("jobs").update({ [step.timestamp_field]: new Date().toISOString() }).eq("id", jobId);
      }

      // Log to workflow_alerts
      await supabase.from("workflow_alerts").insert({
        job_id: jobId,
        step_id: step.id,
        alert_type: "completed",
        details: `Sent "${tpl.name}" to ${recipientPhone}`,
      });

      return { completed: true, detail: `"${tpl.name}" sent to ${recipientPhone}` };
    } catch (e: any) {
      return { completed: false, reason: `Template handler error: ${e.message}` };
    }
  }

  switch (action) {
    case "lookup_jurisdiction": {
      // Invoke the lookup-jurisdiction edge function
      try {
        const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const resp = await fetch(`${supabaseUrl2}/functions/v1/lookup-jurisdiction`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey2}`, "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId }),
        });
        const result = await resp.json();
        if (result.error) {
          // Stamp anyway so chain doesn't block
          await supabase.from("jobs").update({ jurisdiction_looked_up_at: new Date().toISOString() }).eq("id", jobId);
          return { completed: true, detail: `Jurisdiction lookup error: ${result.error} — manual check needed` };
        }
        return { completed: true, detail: `Jurisdiction: ${result.jurisdiction || "unknown"}` };
      } catch (e: any) {
        await supabase.from("jobs").update({ jurisdiction_looked_up_at: new Date().toISOString() }).eq("id", jobId);
        return { completed: true, detail: `Jurisdiction lookup failed: ${e.message} — stamped to continue` };
      }
    }
    case "confirm_photos": {
      // Check if photos exist in tech_form_photos for this job
      const { count } = await supabase
        .from("tech_form_photos")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId);
      if ((count || 0) > 0) {
        await supabase.from("jobs").update({ photos_uploaded_at: new Date().toISOString() }).eq("id", jobId);
        return { completed: true, detail: `${count} photos found` };
      }
      return { completed: false, reason: "No photos found — needs manual upload" };
    }

    case "register_warranty": {
      // Try to invoke the warranty automation
      try {
        const { error } = await supabase.functions.invoke("auto-register-warranty", {
          body: { job_id: jobId },
        });
        if (error) return { completed: false, reason: `Warranty automation failed: ${error.message}` };
        await supabase.from("jobs").update({ warranty_registered_at: new Date().toISOString() }).eq("id", jobId);
        return { completed: true, detail: "Warranty registration triggered" };
      } catch (e: any) {
        return { completed: false, reason: `Warranty error: ${e.message}` };
      }
    }

    case "send_invoice": {
      // ONE SOURCE OF TRUTH: generate invoice from job_line_items via invoicing-agent
      try {
                        const resp = await fetch(`${supabaseUrl}/functions/v1/invoicing-agent`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create_invoice_from_job", job_id: jobId }),
        });
        const data = await resp.json();
        if (data.status === "error") {
          // Fallback: just stamp timestamp if no line items yet
          await supabase.from("jobs").update({ invoice_sent_at: new Date().toISOString() }).eq("id", jobId);
          return { completed: true, detail: `Invoice stamp only — ${data.error}` };
        }
        return { completed: true, detail: `Invoice ${data.invoice_number} created — $${data.total?.toFixed(2)}` };
      } catch (e: any) {
        // Fallback: stamp timestamp even if invoicing-agent fails
        await supabase.from("jobs").update({ invoice_sent_at: new Date().toISOString() }).eq("id", jobId);
        return { completed: true, detail: `Invoice timestamp stamped (agent error: ${e.message})` };
      }
    }

    case "request_review": {
      // Review request function removed — skip this step, log it
      console.log(`Skipping request_review for job ${jobId} — function removed`);
      return { completed: true, detail: "Review request skipped (function removed)" };
    }

    case "complete_follow_up": {
      // Follow-up function removed — skip this step
      console.log(`Skipping complete_follow_up for job ${jobId} — function removed`);
      return { completed: true, detail: "Follow-up skipped (function removed)" };
    }

    case "send_confirmation": {
      // DB trigger `create_job_reminders()` is the ONE source of truth for
      // scheduling day-before reminders at 4 PM Central. This step only:
      //  1. Validates prerequisites
      //  2. For same-day jobs, fires the reminder immediately
      //  3. For future jobs, verifies the trigger row exists and stamps the job
      if (!job.customer_phone) return { completed: false, reason: "No customer phone number" };
      if (!job.scheduled_date) return { completed: false, reason: "No scheduled date — cannot schedule reminder" };

      // Determine if the job is same-day or past-due (reminder should send now)
      const jobDate = new Date(job.scheduled_date + `T00:00:00${detectCentralOffset(job.scheduled_date)}`);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isSameDayOrPast = jobDate <= tomorrow;

      if (isSameDayOrPast) {
        // Same-day / past-due: fire reminder immediately
        try {
          const { error } = await supabase.functions.invoke("send-job-reminders", {
            body: { manual_job_id: jobId },
          });
          if (error) return { completed: false, reason: `Reminder send failed: ${error.message}` };
          return { completed: true, detail: "Reminder sent immediately (same-day)" };
        } catch (e: any) {
          return { completed: false, reason: e.message };
        }
      }

      // Future job: DB trigger already created the reminder row at 4 PM CT.
      // Verify it exists; if missing (edge case), touch scheduled_date to re-fire trigger.
      const { data: existing } = await supabase.from("job_reminders")
        .select("id, scheduled_for")
        .eq("job_id", jobId)
        .eq("reminder_type", "day_before")
        .in("status", ["pending", "sent"])
        .limit(1);

      if (!existing?.length) {
        // Re-fire the DB trigger by touching scheduled_date
        await supabase.from("jobs").update({
          scheduled_date: job.scheduled_date,
        }).eq("id", jobId);
        console.log(`Re-fired reminder trigger for job ${jobId} — row was missing`);
      }

      // Stamp confirmation_sent_at so workflow knows this step completed
      await supabase.from("jobs").update({
        confirmation_sent_at: new Date().toISOString(),
      }).eq("id", jobId);

      const reminderDate = existing?.[0]?.scheduled_for?.split("T")[0] || "day before at 4 PM CT";
      return { completed: true, detail: `Reminder scheduled by DB trigger for ${reminderDate}` };
    }

    case "dispatch": {
      if (!job.scheduled_date) return { completed: false, reason: "No scheduled date" };
      const dispatchTime = new Date(job.scheduled_date + `T16:00:00${detectCentralOffset(job.scheduled_date)}`);
      dispatchTime.setDate(dispatchTime.getDate() - 1);
      if (job.assigned_to) {
        const { data: emp } = await supabase.from("employees")
          .select("phone")
          .ilike("name", `%${job.assigned_to.split(" ")[0]}%`)
          .limit(1)
          .maybeSingle();
        if (!emp?.phone) {
          await supabase.from("jobs").update({ dispatch_sent_at: new Date().toISOString() }).eq("id", jobId);
          return { completed: true, detail: "Dispatch stamped — no tech phone found. Manual dispatch needed." };
        }
        const a2pFooter = "\n\nMsg & data rates may apply. Reply STOP to opt out.";
        const scheduledFormatted = job.scheduled_date ? new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";
        const dispatchMsg = `Job ${job.hcp_job_number || ""} — ${job.job_type} for ${job.customer_name} at ${job.address}. Scheduled: ${scheduledFormatted}. Customer: ${job.customer_phone || "no phone"}.${a2pFooter}`;
        if (dispatchTime <= new Date()) {
          const { error } = await supabase.functions.invoke("send-sms", {
            body: { to: emp.phone, body: dispatchMsg, job_id: jobId },
            headers: { "x-source-function": "auto-advance-workflow" },
          });
          if (error) return { completed: false, reason: `Dispatch SMS failed: ${error.message}` };
          await supabase.from("jobs").update({ dispatch_sent_at: new Date().toISOString() }).eq("id", jobId);
          return { completed: true, detail: `Dispatch SMS sent to ${job.assigned_to}` };
        }
        const { error: insertErr2 } = await supabase.from("job_reminders").upsert({
          job_id: jobId,
          reminder_type: "dispatch",
          scheduled_for: dispatchTime.toISOString(),
          status: "pending",
        }, { onConflict: "job_id,reminder_type" });
        if (insertErr2) return { completed: false, reason: `Failed to schedule dispatch: ${insertErr2.message}` };
        await supabase.from("jobs").update({ dispatch_sent_at: dispatchTime.toISOString() }).eq("id", jobId);
        return { completed: true, detail: `Dispatch scheduled for ${dispatchTime.toISOString().split("T")[0]} at 4PM` };
      }
      await supabase.from("jobs").update({ dispatch_sent_at: new Date().toISOString() }).eq("id", jobId);
      return { completed: true, detail: "Dispatch stamped — no tech assigned yet" };
    }

    case "submit_rebate": {
      // Call the generate-cps-rebate edge function which gathers all data
      // and returns the HTML rebate form for standalone submission.
      try {
        const supabaseUrl3 = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey3 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const resp = await fetch(`${supabaseUrl3}/functions/v1/generate-cps-rebate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey3}`, "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId }),
        });
        const result = await resp.json();
        if (result.error) {
          // Still stamp so chain doesn't get stuck
          await supabase.from("jobs").update({ rebate_submitted_at: new Date().toISOString() }).eq("id", jobId);
          return { completed: true, detail: `Rebate form error: ${result.error} — manual submission needed` };
        }
        return {
          completed: true,
          detail: result.rebate?.qualifies
            ? `CPS rebate form generated � Est. ${result.rebate.rebateAmount} (${result.rebate.tier})`
            : "CPS rebate form generated � verify AHRI data",
        };
      } catch (e: any) {
        await supabase.from("jobs").update({ rebate_submitted_at: new Date().toISOString() }).eq("id", jobId);
        return { completed: true, detail: `Rebate stamped (error: ${e.message}) — manual submission needed` };
      }
    }

    case "schedule_inspection": {
      try {
        const { data: result, error } = await supabase.functions.invoke("auto-apply-permit", {
          body: { job_id: jobId },
        });
        if (error) {
          await supabase.from("jobs").update({ inspection_scheduled_at: new Date().toISOString() }).eq("id", jobId);
          return { completed: true, detail: `Permit scout failed: ${error.message} — manual scheduling needed` };
        }
        await supabase.from("jobs").update({ inspection_scheduled_at: new Date().toISOString() }).eq("id", jobId);
        return {
          completed: true,
          detail: result?.loginRequired
            ? `Permit portal requires login — manual scheduling needed. Authority: ${result.authority}`
            : `Permit portal scouted — ${result.fieldsFound || 0} fields found. Authority: ${result.authority}`,
        };
      } catch (e: any) {
        await supabase.from("jobs").update({ inspection_scheduled_at: new Date().toISOString() }).eq("id", jobId);
        return { completed: true, detail: `Permit scout error: ${e.message} — manual scheduling needed` };
      }
    }

    case "send_maint_report": {
      await supabase.from("jobs").update({ maint_report_sent_at: new Date().toISOString() }).eq("id", jobId);
      return { completed: true, detail: "Maintenance report marked ready for standalone email client" };
    }

    case "schedule_next_visit": {
      // Auto-stamp and set status to done
      await supabase.from("jobs").update({
        next_visit_scheduled_at: new Date().toISOString(),
        status: "done",
      }).eq("id", jobId);
      return { completed: true, detail: "Next visit scheduled, job marked done" };
    }

    default: {
      // Respect fallback_behavior — default is block_chain (never silently fake)
      const fallback = step.fallback_behavior || "block_chain";

      if (fallback === "stamp_and_log" && step.timestamp_field) {
        await supabase.from("jobs").update({ [step.timestamp_field]: new Date().toISOString() }).eq("id", jobId);
        await supabase.from("workflow_alerts").insert({
          job_id: jobId,
          step_id: step.id,
          alert_type: "completed",
          details: `Stamp-and-log fallback for action: ${action}`,
        });
        return { completed: true, detail: `Stamped ${step.timestamp_field} (stamp_and_log fallback)` };
      }

      if (fallback === "escalate") {
        await supabase.from("workflow_alerts").insert({
          job_id: jobId,
          step_id: step.id,
          alert_type: "escalated",
          details: `No handler for action: ${action}`,
        });
        // Escalation logged to workflow_alerts (approval-alert function removed)
        return { completed: false, reason: `Escalated: no handler for ${action}` };
      }

      // block_chain (default) — stop the chain
      await supabase.from("workflow_alerts").insert({
        job_id: jobId,
        step_id: step.id,
        alert_type: "blocked",
        details: `Chain blocked: no handler for action "${action}"`,
      });
      return { completed: false, reason: `No auto-handler for action: ${action}` };
    }
  }
}
