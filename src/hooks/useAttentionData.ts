/**
 * useAttentionData.ts — Shared hook for operational attention data
 *
 * ONE SOURCE OF TRUTH: All attention/HUD queries run here. No other component
 * should run its own attention-style queries.
 *
 * RELIABILITY: Uses Promise.allSettled so one failing query never takes down
 * the entire dashboard. Failed queries return 0 and are logged + surfaced
 * via the `errors` array so nothing fails silently.
 *
 * Polls every 300 seconds as a safety net; realtime handles freshness.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFollowUpJobs } from "@/hooks/useJobs";
import { useAgreementVisitsDue, useExpiringAgreements, useServiceAgreements } from "@/hooks/useServiceAgreements";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { safeCount } from "@/lib/querySafety";
import {
  AlertTriangle, CalendarX, MessageSquare, CreditCard, FileText, Shield,
  Receipt, FileCheck, Camera, ThumbsUp, CalendarCheck, ClipboardCheck, FileQuestion,
  Mail, MessageCircle, Bot, MailWarning, Inbox, MapPin, Eye, User, Crown,
} from "lucide-react";

const GO_LIVE = '2026-03-24';
export const GLOBAL_ACTION_NEEDED_ROUTE = "/copilot";

function useAttentionCounts() {
  return useQuery({
    queryKey: ["hud_attention_counts"],
    staleTime: 30000,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const today = new Date().toISOString().split("T")[0];

      const errors: string[] = [];

      // Pre-fetch job IDs that already have a paid customer invoice — used to exclude
      // them from "Invoices" attention so HCP-paid jobs auto-clear.
      const { data: paidInvoiceRows } = await supabase
        .from("customer_invoices")
        .select("job_id")
        .eq("status", "paid")
        .not("job_id", "is", null);
      const paidJobIds = new Set(Array.from(new Set((paidInvoiceRows || []).map((r: any) => r.job_id))).filter(Boolean));

      // ALL queries fire simultaneously via Promise.allSettled — one failure won't break others
      const results = await Promise.allSettled([
        // 0: Past Due — excludes HCP-completed jobs AND jobs with completed_at set
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .lt("scheduled_date", today)
          .not("scheduled_date", "is", null)
          .not("status", "in", '("done","invoiced","canceled")')
          .is("completed_at", null)
          .not("hcp_status", "ilike", "%complete%"),

        // 1: Ready to Schedule (unscheduled, not on_hold, not follow-up)
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .is("scheduled_date", null)
          .neq("status", "on_hold")
          .or("needs_follow_up.is.null,needs_follow_up.eq.false")
          .not("status", "in", '("done","invoiced","canceled")'),

        // 1b: Waiting on Parts (on_hold status)
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("status", "on_hold")
          .not("status", "in", '("done","invoiced","canceled")'),

        // 2: Deposits needed
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("job_type", "install")
          .is("deposit_paid_at", null)
          .not("assigned_to", "is", null)
          .not("scheduled_date", "is", null)
          .neq("payment_method", "financed")
          .not("status", "in", '("done","invoiced","canceled")')
          .gte("created_at", GO_LIVE),

        // 3: Finance paperwork
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("job_type", "install")
          .eq("payment_method", "financed")
          .is("finance_paperwork_at", null)
          .not("assigned_to", "is", null)
          .not("status", "in", '("done","invoiced","canceled")')
          .gte("created_at", GO_LIVE),

        // 4: Invoices not sent — fetch candidates, then exclude paid jobs locally.
        // This avoids generating a huge `not in (...)` URL when many paid invoices exist.
        supabase.from("jobs").select("id")
          .in("status", ["done", "in_progress"])
          .is("invoice_sent_at", null)
          .not("completion_form_sent_at", "is", null)
          .gte("created_at", GO_LIVE)
          .limit(5000),

        // 5: Warranty not registered
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("job_type", "install")
          .in("status", ["done", "invoiced"])
          .is("warranty_registered_at", null)
          .gte("created_at", GO_LIVE),

        // 6: Inspection pending
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("job_type", "install")
          .eq("permit_required", true)
          .in("status", ["done", "invoiced"])
          .is("inspection_passed_at", null)
          .gte("created_at", GO_LIVE),

        // 7: Unpaid invoices 7d+
        supabase.from("customer_invoices").select("id", { count: "exact", head: true })
          .eq("status", "sent")
          .lt("sent_at", sevenDaysAgo.toISOString())
          .is("paid_at", null),

        // 8: Missing site visit photos
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("site_visit_missing", true)
          .is("photos_uploaded_at", null)
          .not("status", "in", '("done","invoiced","canceled")'),

        // 9: Parts ready for pickup
        supabase.from("parts_orders" as any).select("id", { count: "exact", head: true })
          .eq("status", "ready_for_pickup"),

        // 10: AI auto-completed today
        supabase.from("activity_log").select("id", { count: "exact", head: true })
          .eq("action", "auto_completed")
          .gte("created_at", todayStart.toISOString()),

        // 11: Tech proposals pending review
        supabase.from("estimate_reviews").select("id", { count: "exact", head: true })
          .eq("status", "pending_review"),

        // 12: Unmatched invoices
        supabase.from("job_invoices").select("id", { count: "exact", head: true })
          .eq("match_status", "pending_review"),

        // 13: Outbox: pending emails
        supabase.from("outbound_drafts").select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("channel", "email"),

        // 14: Outbox: pending SMS
        supabase.from("outbound_drafts").select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("channel", "sms"),

        // 15: Unread inbound SMS (consolidated from HUD)
        supabase.from("sms_log").select("id", { count: "exact", head: true })
          .eq("direction", "inbound")
          .eq("is_read", false),

        // 16: AI handoff queue (email_actions table removed — always 0)
        Promise.resolve({ count: 0, error: null }),

        // 17: Email needs-attention (email_actions table removed — always 0)
        Promise.resolve({ count: 0, error: null }),

        // 18: Unread customer emails (emails table removed — always 0)
        Promise.resolve({ count: 0, error: null }),

        // 19: Outbox total pending (consolidated from HUD)
        supabase.from("outbound_drafts").select("id", { count: "exact", head: true })
          .eq("status", "pending"),

        // 20: Payment failures (Stripe declines on active jobs)
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .not("last_payment_error", "is", null)
          .not("status", "in", '("done","canceled")')
          .gte("created_at", GO_LIVE),

        // 22: Action items pending (JARVIS decision queue — replaces address_verify + jarvis_observer)
        supabase.from("action_items" as any).select("id", { count: "exact", head: true })
          .eq("status", "pending"),

        // 23: New leads (uncontacted, excluding LSA — LSA has its own card)
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "new")
          .neq("source", "google_lsa"),

      ]);

      const overdue            = safeCount(results[0], "Overdue Jobs", errors);
      const readyToSchedule    = safeCount(results[1], "Ready to Schedule", errors);
      const waitingOnParts     = safeCount(results[2], "Waiting on Parts", errors);
      const deposits           = safeCount(results[3], "Deposits", errors);
      const finance            = safeCount(results[4], "Finance", errors);
      const invoices           = results[5].status === "fulfilled" && !results[5].value.error
        ? ((results[5].value.data as any[]) || []).filter((job: any) => !paidJobIds.has(job.id)).length
        : safeCount(results[5] as PromiseSettledResult<any>, "Invoices", errors);
      const warranty           = safeCount(results[6], "Warranty", errors);
      const inspection         = safeCount(results[7], "Inspection", errors);
      const unpaid             = safeCount(results[8], "Unpaid Invoices", errors);
      const missingSite        = safeCount(results[9], "Missing Site", errors);
      const partsReady         = safeCount(results[10], "Parts Ready", errors);
      const aiCompleted        = safeCount(results[11], "AI Completed", errors);
      const techProposals      = safeCount(results[12], "Tech Proposals", errors);
      const unmatchedInvoices  = safeCount(results[13], "Unmatched Invoices", errors);
      const pendingEmails      = safeCount(results[14], "Pending Emails", errors);
      const pendingSms         = safeCount(results[15], "Pending SMS", errors);
      const unreadSms          = safeCount(results[16], "Unread SMS", errors);
      const aiHandoff          = safeCount(results[17], "AI Handoff", errors);
      const emailAttention     = safeCount(results[18], "Email Attention", errors);
      const unreadEmails       = safeCount(results[19], "Unread Emails", errors);
      const outboxTotal        = safeCount(results[20], "Outbox Total", errors);
      const paymentFailed      = safeCount(results[21], "Payment Failures", errors);
      const actionItems        = safeCount(results[22], "Action Items", errors);
      const newLeads           = safeCount(results[23], "New Leads", errors);

      let customerResponsesCount = 0;

      try {
        const { data: pendingResponses, error: prErr } = await supabase
          .from("estimate_responses" as any)
          .select("id, estimate_id");

        if (prErr) {
          console.error("[MissionControl] Customer responses query error:", prErr);
          errors.push("Customer Responses");
        } else if (pendingResponses && pendingResponses.length > 0) {
          const estIds = [...new Set((pendingResponses as any[]).map((r: any) => r.estimate_id))];
          const { data: ests } = await supabase
            .from("estimates" as any)
            .select("id, work_status")
            .in("id", estIds);
          const unactedEstIds = new Set(
            ((ests || []) as any[])
              .filter((e: any) => !["won", "lost"].includes(e.work_status))
              .map((e: any) => e.id)
          );
          customerResponsesCount = (pendingResponses as any[]).filter((r: any) => unactedEstIds.has(r.estimate_id)).length;
        }
      } catch (e) {
        console.error("[MissionControl] Customer responses block failed:", e);
        errors.push("Customer Responses");
      }

      if (errors.length > 0) {
        console.warn(`[MissionControl] ${errors.length} query/queries failed:`, errors);
      }

      return {
        overdue,
        readyToSchedule,
        waitingOnParts,
        deposits,
        finance,
        invoices,
        warranty,
        inspection,
        unpaid,
        missingSite,
        partsReady,
        aiCompleted,
        techProposals,
        
        customerResponses: customerResponsesCount,
        unmatchedInvoices,
        pendingEmails,
        pendingSms,
        // Consolidated HUD queries
        unreadSms,
        aiHandoff,
        emailAttention,
        unreadEmails,
        outboxTotal,
        paymentFailed,
        actionItems,
        newLeads,
        // Error tracking — nothing fails silently
        _errors: errors,
      };
    },
    refetchInterval: 300000,
  });
}

export interface AttentionItem {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  bg: string;
  route: string;
  severity: "critical" | "warning" | "info";
  alwaysShow?: boolean;
}

export function useAttentionData() {
  const { data: counts, error: countsError, isError } = useAttentionCounts();
  const { data: followUpJobs } = useFollowUpJobs();
  const { data: visitsDue } = useAgreementVisitsDue();
  const { data: expiringAgreements } = useExpiringAgreements(30);
  const { data: allAgreements } = useServiceAgreements();

  // Realtime: auto-invalidate HUD on ANY change to attention-driving tables
  useRealtimeInvalidation(
    [
      { table: "outbound_drafts", queryKeys: [["hud_attention_counts"], ["outbound_drafts"], ["outbox_pending_count"]] },
      { table: "sms_log", queryKeys: [["hud_attention_counts"]] },
      { table: "jobs", queryKeys: [["hud_attention_counts"]] },
      { table: "action_items", queryKeys: [["hud_attention_counts"]] },
    ],
    "hud-realtime-sync"
  );

  const followUpCount = followUpJobs?.length || 0;
  const visitsDueCount = visitsDue?.length || 0;
  const activeAgreementsCount = (allAgreements || []).filter(a => a.status === "active" && new Date(a.end_date) >= new Date()).length;
  const aiHandledCount = counts?.aiCompleted || 0;
  const expiringCount = expiringAgreements?.length || 0;

  // Errors from individual queries that failed
  const queryErrors = counts?._errors || [];
  // React Query level error
  if (isError && countsError) {
    console.error("[MissionControl] Top-level query failed:", countsError);
  }

  const items: AttentionItem[] = [
    { label: "Ready to Schedule", count: counts?.readyToSchedule || 0,  icon: CalendarX,      color: "text-warm",         bg: "bg-warm/10",          route: "/jobs/backlog",             severity: "critical" },
    { label: "Waiting on Parts",  count: counts?.waitingOnParts || 0,   icon: Receipt,        color: "text-orange-600",   bg: "bg-orange-600/10",    route: "/jobs/backlog",             severity: "warning" },
    { label: "Parts Ready",       count: counts?.partsReady || 0,       icon: Receipt,        color: "text-emerald-600",  bg: "bg-emerald-600/10",  route: "/?attention=parts_ready",   severity: "info" },
    { label: "Missing Site Data", count: counts?.missingSite || 0,      icon: Camera,         color: "text-amber-500",    bg: "bg-amber-500/10",    route: "/?attention=missing_site",  severity: "warning" },
    { label: "Past Due",          count: counts?.overdue || 0,          icon: AlertTriangle,  color: "text-overdue",      bg: "bg-overdue/10",      route: "/?attention=overdue",       severity: "critical" },
    { label: "Follow-Up",         count: followUpCount,                    icon: MessageSquare,  color: "text-sky",          bg: "bg-sky/10",          route: "/jobs/backlog",             severity: "warning" },
    { label: "Deposits",          count: counts?.deposits || 0,         icon: CreditCard,     color: "text-amber-600",    bg: "bg-amber-600/10",    route: "/?attention=deposits",      severity: "warning" },
    { label: "Finance",           count: counts?.finance || 0,          icon: FileText,       color: "text-purple-600",   bg: "bg-purple-600/10",   route: "/?attention=finance",       severity: "warning" },
    { label: "Invoices",          count: counts?.invoices || 0,         icon: FileCheck,      color: "text-emerald-600",  bg: "bg-emerald-600/10",  route: "/?attention=invoices",      severity: "warning" },
    { label: "Unpaid 7d+",        count: counts?.unpaid || 0,           icon: Receipt,        color: "text-destructive",  bg: "bg-destructive/10",  route: "/payments",                 severity: "critical" },
    { label: "Warranty",          count: counts?.warranty || 0,         icon: Shield,         color: "text-blue-600",     bg: "bg-blue-600/10",     route: "/?attention=warranty",      severity: "warning" },
    { label: "Inspection",        count: counts?.inspection || 0,       icon: Receipt,        color: "text-orange-600",   bg: "bg-orange-600/10",   route: "/?attention=inspection",    severity: "warning" },
    { label: "Tech Proposals",    count: counts?.techProposals || 0,    icon: ClipboardCheck, color: "text-violet-600",   bg: "bg-violet-600/10",   route: "/copilot",                  severity: "critical" },
    
    { label: "Unmatched",         count: counts?.unmatchedInvoices || 0, icon: FileQuestion,   color: "text-amber-500",    bg: "bg-amber-500/10",    route: "/copilot",                  severity: "warning" },
    { label: "Emails in Queue",   count: counts?.pendingEmails || 0,    icon: Mail,           color: "text-blue-500",     bg: "bg-blue-500/10",     route: "/email?folder=outbox",      severity: "warning" },
    { label: "SMS in Queue",      count: counts?.pendingSms || 0,       icon: MessageCircle,  color: "text-green-500",    bg: "bg-green-500/10",    route: "/copilot",                  severity: "warning" },
    { label: "Customer Decisions",count: counts?.customerResponses || 0,icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-600/10",  route: "/estimates",                severity: "info" },
    { label: "Comfort Club",      count: activeAgreementsCount,            icon: Crown,          color: "text-teal-600",     bg: "bg-teal-600/10",     route: "/agreements",               severity: "info",   alwaysShow: true },
    { label: "Payment Failures",  count: counts?.paymentFailed || 0,    icon: CreditCard,     color: "text-destructive",  bg: "bg-destructive/10",  route: "/jobs?filter=payment_failed", severity: "critical" },
    { label: "Action Items",      count: counts?.actionItems || 0,      icon: Bot,            color: "text-amber-500",    bg: "bg-amber-500/10",    route: "/copilot",                  severity: "critical" },
    { label: "New Leads",         count: counts?.newLeads || 0,         icon: User,           color: "text-emerald-600",  bg: "bg-emerald-600/10",  route: "/leads",                    severity: "critical", alwaysShow: true },
    
  ];

  // HUD-specific items (consolidated — ONE SOURCE OF TRUTH)
  const hudItems = [
    // Communication-first: these are the app's primary value as HCP overlay
    { key: "unread_sms",       icon: MessageCircle, label: "Unread SMS",          count: counts?.unreadSms || 0,        color: "text-complete",     bgClass: "from-complete/10 to-card",   borderClass: "border-complete/30", route: "/sms" },
    { key: "unread_emails",    icon: Mail,          label: "Unread Emails",       count: counts?.unreadEmails || 0,     color: "text-primary",      bgClass: "from-primary/10 to-card",    borderClass: "border-primary/30",  route: "/email" },
    { key: "email_attention",  icon: MailWarning,   label: "Email Attention",     count: counts?.emailAttention || 0,   color: "text-warm",         bgClass: "from-warm/10 to-card",       borderClass: "border-warm/30",     route: "/email" },
    { key: "ai_handoff",       icon: Bot,           label: "AI Needs Handoff",    count: counts?.aiHandoff || 0,        color: "text-today",        bgClass: "from-today/10 to-card",      borderClass: "border-today/30",    route: "/copilot" },
    { key: "sms_outbox",       icon: MessageCircle, label: "SMS in Queue",        count: counts?.pendingSms || 0,       color: "text-green-500",    bgClass: "from-green-500/10 to-card",  borderClass: "border-green-500/30", route: "/copilot" },
    { key: "email_outbox",     icon: Mail,          label: "Emails in Queue",     count: counts?.pendingEmails || 0,    color: "text-blue-500",     bgClass: "from-blue-500/10 to-card",   borderClass: "border-blue-500/30", route: "/email?folder=outbox" },
    // Operational items — secondary in HCP overlay mode
    { key: "overdue",          icon: AlertTriangle, label: "Past Due",            count: counts?.overdue || 0,          color: "text-overdue",      bgClass: "from-overdue/10 to-card",    borderClass: "border-overdue/30",  route: "/?attention=overdue" },
    { key: "ready_schedule",   icon: CalendarX,     label: "Ready to Schedule",   count: counts?.readyToSchedule || 0,  color: "text-warm",         bgClass: "from-warm/10 to-card",       borderClass: "border-warm/30",     route: "/jobs/backlog" },
    { key: "waiting_parts",    icon: Receipt,       label: "Waiting on Parts",    count: counts?.waitingOnParts || 0,   color: "text-orange-600",   bgClass: "from-orange-600/10 to-card", borderClass: "border-orange-600/30", route: "/jobs/backlog" },
    { key: "followup",         icon: MessageSquare, label: "Follow-Up",           count: followUpCount,                    color: "text-sky",          bgClass: "from-sky/10 to-card",        borderClass: "border-sky/30",      route: "/jobs/backlog" },
    { key: "payment_failed",   icon: CreditCard,    label: "Payment Failures",    count: counts?.paymentFailed || 0,   color: "text-destructive",  bgClass: "from-destructive/10 to-card", borderClass: "border-destructive/30", route: "/jobs?filter=payment_failed" },
    { key: "expiring",         icon: Shield,        label: "Expiring Agreements", count: expiringCount,                    color: "text-warm",         bgClass: "from-warm/10 to-card",       borderClass: "border-warm/30",     route: "/agreements" },
  ];

  const activeItems = items.filter((i) => i.count > 0 || i.alwaysShow);
  const needsYou = activeItems.filter((i) => i.severity === "critical" || i.severity === "warning");
  const infoItems = activeItems.filter((i) => i.severity === "info");
  const totalAttention = activeItems.filter((i) => i.severity !== "info").reduce((sum, i) => sum + i.count, 0);

  return {
    items,
    activeItems,
    needsYou,
    infoItems,
    aiHandledCount,
    totalAttention,
    // HUD consolidated data
    hudItems,
    // Error surfacing — NOTHING FAILS SILENTLY
    queryErrors,
    hasErrors: queryErrors.length > 0 || isError,
  };
}
