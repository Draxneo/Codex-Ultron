import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCompanySettings } from "@/lib/companySettings";
import { sendSmsImpl } from "@/hooks/useSendSms";
import { useSendOnMyWay } from "@/hooks/useSendOnMyWay";

type JobActionKey = "reminder" | "omw" | "start" | "finish" | "review" | "manual";

type JobLike = {
  customer_name?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  assigned_to?: string | null;
  assigned_employee_id?: string | null;
  employee_id?: string | null;
};

function firstName(name?: string | null) {
  return name?.trim()?.split(/\s+/)[0] || "there";
}

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
      const companyName = settings.company_name || "Carnes and Sons Air Conditioning";
      const reviewLink = settings.google_review_url || settings.review_url || settings.review_link || "";
      const name = firstName(job.customer_name);
      const body = reviewLink
        ? `Hi ${name}, thank you for choosing ${companyName}. Would you mind leaving us a quick review? ${reviewLink}`
        : `Hi ${name}, thank you for choosing ${companyName}. If we did a great job, would you reply here and let us know?`;

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
