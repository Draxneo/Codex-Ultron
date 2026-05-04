import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCompanySettings } from "@/lib/companySettings";
import { sendSmsImpl } from "@/hooks/useSendSms";
import { useSendOnMyWay } from "@/hooks/useSendOnMyWay";
import { buildJobCompleteSms, buildReviewRequestSms } from "@/lib/smsCopy";
import { getJobCompanyName } from "@/lib/jobCompany";

type JobActionKey = "reminder" | "omw" | "start" | "finish" | "review" | "manual";

/**
 * dispatchInstallCloseoutActions
 *
 * SYSTEM CONNECTIONS: writes to public.action_items (Now HQ feed).
 * SITS ON: useJobActions.finishJob (called immediately after a job is marked done).
 *
 * Purpose: turn the install workflow's closeout steps (warranty registration,
 * CPS rebate, city inspection, 7-day quality check) into surfaced action cards
 * with owners, instead of relying on a workflow engine that's being phased out.
 *
 * Hard rules:
 * - Skip legacy jobs (hcp_id or import_run_id present) — those came from the HCP
 *   import and are explicitly out-of-scope for the new closeout pipeline.
 * - Skip jobs that aren't installs (job_type !== 'install').
 * - Skip individual steps if their gating column is already set (don't recreate
 *   warranty registration if warranty_registered_at exists, etc).
 *
 * Each card lands in the appropriate office queue per docs/jarvis-action-gateway.md
 * and docs/ultraoffice20-product-principles.md §3 (office queue for closeout work).
 */
async function dispatchInstallCloseoutActions(jobId: string): Promise<void> {
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, job_type, customer_id, customer_phone, customer_name, address, " +
      "rebate_eligible, permit_required, " +
      "warranty_registered_at, rebate_submitted_at, inspection_scheduled_at, " +
      "hcp_id, import_run_id"
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const j = job as any;

  // Legacy gate: anything imported from HCP is out of scope.
  if (j.hcp_id || j.import_run_id) return;

  // Only install jobs get the install closeout pipeline.
  if (j.job_type !== "install") return;

  const baseRow = {
    customer_phone: j.customer_phone || null,
    job_id: j.id,
    status: "pending" as const,
    source: "install_closeout",
  };

  type CloseoutCard = {
    title: string;
    description: string;
    category: string;
    priority: "low" | "medium" | "high";
    due_date?: string | null;
    metadata: Record<string, unknown>;
  };

  const cards: CloseoutCard[] = [];

  // 1. Warranty registration — required for every install.
  if (!j.warranty_registered_at) {
    cards.push({
      title: `Register warranty — ${j.customer_name || "install"}`,
      description: `Install completed for ${j.customer_name || "customer"}${j.address ? " at " + j.address : ""}. Register equipment warranty with manufacturer portal.`,
      category: "warranty_registration",
      priority: "medium",
      metadata: {
        owner_type: "office_queue",
        owner_queue: "closeout",
        owner_label: "Closeout queue",
        owner_required: true,
        closeout_step: "warranty",
        customer_id: j.customer_id || null,
      },
    });
  }

  // 2. CPS rebate — only if eligible and not already submitted.
  if (j.rebate_eligible === true && !j.rebate_submitted_at) {
    cards.push({
      title: `Submit CPS rebate — ${j.customer_name || "install"}`,
      description: `Customer is rebate-eligible. Prepare and submit CPS rebate paperwork.`,
      category: "cps_rebate",
      priority: "low",
      metadata: {
        owner_type: "office_queue",
        owner_queue: "closeout",
        owner_label: "Closeout queue",
        owner_required: true,
        closeout_step: "cps_rebate",
        customer_id: j.customer_id || null,
      },
    });
  }

  // 3. City inspection — only if permit was required and inspection isn't already scheduled.
  if (j.permit_required === true && !j.inspection_scheduled_at) {
    cards.push({
      title: `Schedule city inspection — ${j.customer_name || "install"}`,
      description: `Permit was pulled for this install. Schedule the city inspection through the jurisdiction portal.`,
      category: "city_inspection",
      priority: "medium",
      metadata: {
        owner_type: "office_queue",
        owner_queue: "closeout",
        owner_label: "Closeout queue",
        owner_required: true,
        closeout_step: "city_inspection",
        customer_id: j.customer_id || null,
      },
    });
  }

  // 4. 7-day quality check — surfaces a week from now, not immediately.
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  cards.push({
    title: `7-day check on ${j.customer_name || "install customer"}`,
    description: `One week post-install: confirm everything is running well, address any concerns, and prompt for review.`,
    category: "quality_check_7d",
    priority: "low",
    due_date: sevenDaysOut.toISOString(),
    metadata: {
      owner_type: "office_queue",
      owner_queue: "customer_follow_up",
      owner_label: "Customer follow-up",
      owner_required: true,
      closeout_step: "quality_check_7d",
      customer_id: j.customer_id || null,
    },
  });

  if (cards.length === 0) return;

  // Insert each closeout card. We do these as plain inserts (not via upsertLiveActionItem)
  // because each closeout step is a single one-shot per job — no merge target should exist.
  // The dedup helper would still match correctly since job_id is shared, but doing direct
  // inserts here keeps each closeout step as its own discrete card so the office queue
  // can work them in parallel.
  const rows = cards.map((c) => ({
    ...baseRow,
    title: c.title,
    description: c.description,
    category: c.category,
    priority: c.priority,
    due_date: c.due_date ?? null,
    metadata: { ...c.metadata, living_card: true, source_job_id: jobId },
  }));

  const { error } = await supabase.from("action_items").insert(rows as any);
  if (error) {
    // Closeout failure should not block the job-finish flow — surface a console warning
    // and log a system error, but let the user proceed. Office queue can manually
    // create cards if needed.
    console.warn("Closeout dispatch partial failure:", error.message);
  }
}

type JobLike = {
  customer_name?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  assigned_to?: string | null;
  assigned_employee_id?: string | null;
  employee_id?: string | null;
};

export function useJobActions(jobId: string, job?: JobLike | null) {
  const queryClient = useQueryClient();
  const { send: sendOMW, sending: sendingOMW } = useSendOnMyWay();
  const [busy, setBusy] = useState<JobActionKey | null>(null);

  const invalidate = async () => {
    queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["activity_log"] });
    queryClient.invalidateQueries({ queryKey: ["tech_dashboard_data"] });
  };

  const updateJob = async (updates: Record<string, unknown>, action: string, details: string) => {
    const { error } = await supabase.from("jobs").update(updates as any).eq("id", jobId);
    if (error) throw error;
    await supabase.from("activity_log").insert({ job_id: jobId, action, details });
    await invalidate();
  };

  const startJob = async () => {
    setBusy("start");
    try {
      await updateJob(
        { status: "in_progress", started_at: new Date().toISOString() },
        "job_started",
        "Job marked in progress",
      );
      toast({ title: "Job started" });
    } catch (e: any) {
      toast({ title: "Could not start job", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const finishJob = async () => {
    setBusy("finish");
    try {
      await updateJob(
        { status: "done", completed_at: new Date().toISOString() },
        "job_finished",
        "Job marked finished",
      );

      // Fire the install closeout pipeline (warranty, CPS rebate, inspection, 7-day QC).
      // This is forward-only: legacy/HCP-imported jobs are filtered out inside the helper.
      // Failures inside dispatchInstallCloseoutActions are non-fatal — the user-visible
      // finish flow continues even if a closeout card couldn't be created.
      await dispatchInstallCloseoutActions(jobId);

      if (job?.customer_phone) {
        const companyName = await getJobCompanyName(jobId);
        const body = buildJobCompleteSms({
          customerName: job.customer_name,
          companyName,
        });
        const sms = await sendSmsImpl({
          to: job.customer_phone,
          body,
          jobId,
          contactName: job.customer_name || null,
          contactType: "customer",
          source: "job_complete",
          hitlApproved: true,
          silent: true,
        });
        await supabase.from("activity_log").insert({
          job_id: jobId,
          action: sms.success ? "job_complete_sms_sent" : "job_complete_sms_failed",
          details: sms.success
            ? `Completion SMS sent to ${job.customer_name || job.customer_phone}`
            : `Completion SMS failed for ${job.customer_name || job.customer_phone}: ${sms.error || "unknown error"}`,
        });
      }
      toast({ title: "Job finished" });
    } catch (e: any) {
      toast({ title: "Could not finish job", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const sendOnMyWay = async () => {
    setBusy("omw");
    try {
      await sendOMW({
        jobId,
        customerPhone: job?.customer_phone,
        customerName: job?.customer_name,
        jobAddress: job?.address,
        employeeName: job?.assigned_to,
        employeeId: job?.assigned_employee_id || job?.employee_id || null,
      });
    } finally {
      setBusy(null);
    }
  };

  const sendAppointmentReminder = async () => {
    setBusy("reminder");
    try {
      const { data, error } = await supabase.functions.invoke("send-job-reminders", {
        body: { manual_job_id: jobId },
      });
      if (error) throw error;
      if ((data as any)?.queued) {
        toast({ title: "Reminder queued", description: "It is waiting in the SMS safety queue." });
      } else {
        toast({ title: "Reminder sent" });
      }
      await invalidate();
    } catch (e: any) {
      toast({ title: "Could not send reminder", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const sendReviewRequest = async () => {
    if (!job?.customer_phone) {
      toast({ title: "No customer phone", description: "Cannot send review request without a phone number.", variant: "destructive" });
      return;
    }

    setBusy("review");
    try {
      const settings = await getCompanySettings(["company_name", "google_review_url", "review_url", "review_link"]);
      const companyName = await getJobCompanyName(jobId, settings.company_name || "our team");
      const reviewLink = settings.google_review_url || settings.review_url || settings.review_link || "";
      const body = buildReviewRequestSms({ customerName: job.customer_name, companyName, reviewLink });

      const result = await sendSmsImpl({
        to: job.customer_phone,
        body,
        jobId,
        contactName: job.customer_name || null,
        contactType: "customer",
        source: "review_request",
        hitlApproved: true,
        silent: true,
      });
      if (!result.success) throw new Error(result.error || "SMS failed");

      await updateJob(
        { review_request_sent_at: new Date().toISOString() },
        "review_request_sent",
        `Review request SMS sent to ${job.customer_name || job.customer_phone}`,
      );
      toast({ title: "Review request sent" });
    } catch (e: any) {
      toast({ title: "Could not send review request", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const markReminderSentManually = async () => {
    setBusy("manual");
    try {
      await updateJob(
        { confirmation_sent_at: new Date().toISOString() },
        "appointment_reminder_marked_sent",
        "Reminder manually marked as sent",
      );
      toast({ title: "Reminder marked manually" });
    } catch (e: any) {
      toast({ title: "Could not mark reminder", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const markReviewSentManually = async () => {
    setBusy("manual");
    try {
      await updateJob(
        { review_request_sent_at: new Date().toISOString() },
        "review_request_marked_sent",
        "Review request manually marked as sent",
      );
      toast({ title: "Review request marked manually" });
    } catch (e: any) {
      toast({ title: "Could not mark review request", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    sendingOMW,
    sendOnMyWay,
    startJob,
    finishJob,
    sendAppointmentReminder,
    sendReviewRequest,
    markReminderSentManually,
    markReviewSentManually,
  };
}
