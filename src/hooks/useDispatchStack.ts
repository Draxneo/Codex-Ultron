/**
 * useDispatchStack.ts — Hook for Dispatch Stack drawer (left rail)
 *
 * SYSTEM: Dispatch HQ needs a collapsible left sidebar showing work without
 * a calendar slot. This hook queries those items in 4 categories:
 *   - Past Due: jobs scheduled < today, not closed, not completed
 *   - Ready to Schedule: jobs with no scheduled_date, not on_hold, not closed
 *   - Customer Decisions: estimate_responses awaiting action (won/lost)
 *   - New Leads: leads created since launch, not closed
 *
 * DATA SHAPE: Each item is a StackItem with kind, title, subtitle, sortKey,
 * and target URL for navigation.
 *
 * RELIABILITY: Uses Promise.allSettled so one query failure doesn't crash the
 * drawer. Failed queries return empty arrays and are logged via errors[].
 *
 * REALTIME: Invalidates on changes to jobs, leads, estimates, estimate_responses.
 * Stale time 30s to balance freshness vs API load.
 *
 * Sits on: Dispatch calendar (DispatchStackDrawer) as its data source.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { APP_ACTION_GO_LIVE_ISO, CLOSED_WORK_STATUS_FILTER, CLOSED_LEAD_STATUS_FILTER } from "@/lib/appLifecycle";
import { formatDistanceToNow, parseISO } from "date-fns";

export type StackItem = {
  id: string;
  kind: "ready_to_schedule" | "past_due" | "new_lead" | "estimate_response";
  title: string; // customer name or job number
  subtitle?: string; // e.g. "Service · 2 days overdue"
  sortKey: number; // older/earlier = lower = higher priority
  target: string; // URL to navigate when clicked
};

export type DispatchStackData = {
  readyToSchedule: StackItem[];
  pastDue: StackItem[];
  newLeads: StackItem[];
  estimateResponses: StackItem[];
  isLoading: boolean;
  isError: boolean;
  errors: string[];
};

export function useDispatchStack(): DispatchStackData {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dispatch-stack"],
    staleTime: 30000, // 30s stale time
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const errors: string[] = [];

      // Fire all queries simultaneously via Promise.allSettled
      // 2026-05-04 v2: "Ready to Schedule" now ALSO includes jobs and estimates
      // that have a scheduled_date but no arrival_start window — Clint asks for
      // those to surface here so when JARVIS captures "Wednesday anytime" the
      // booking lands in the stack and the dispatcher slots it onto the
      // weekly calendar by hand.
      const results = await Promise.allSettled([
        // 0: Ready to Schedule (jobs) — no scheduled_date OR scheduled_date set but no arrival_start
        supabase
          .from("jobs")
          .select("id, customer_name, job_type, scheduled_date, arrival_start, created_at")
          .or("scheduled_date.is.null,arrival_start.is.null")
          .neq("status", "on_hold")
          .or("needs_follow_up.is.null,needs_follow_up.eq.false")
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .gte("created_at", APP_ACTION_GO_LIVE_ISO)
          .order("created_at", { ascending: false })
          .limit(50),

        // 1: Past Due — jobs with scheduled_date < today, not closed, not completed
        supabase
          .from("jobs")
          .select("id, customer_name, job_type, scheduled_date, created_at")
          .lt("scheduled_date", today)
          .not("scheduled_date", "is", null)
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .is("completed_at", null)
          .not("hcp_status", "ilike", "%complete%")
          .gte("created_at", APP_ACTION_GO_LIVE_ISO)
          .order("scheduled_date", { ascending: true })
          .limit(50),

        // 2: New Leads — leads created since launch, not closed
        supabase
          .from("leads")
          .select("id, customer_name, created_at")
          .not("status", "in", CLOSED_LEAD_STATUS_FILTER)
          .gte("created_at", APP_ACTION_GO_LIVE_ISO)
          .order("created_at", { ascending: false })
          .limit(50),

        // 3: Customer Responses — estimate_responses awaiting decision on active estimates
        supabase
          .from("estimate_responses")
          .select("id, estimate_id"),

        // 4: Ready-to-Schedule (estimates) — same logic as jobs above. JARVIS
        // booked the estimate with a date but no time → shows up here so the
        // dispatcher can slot it onto the weekly calendar manually.
        supabase
          .from("estimates")
          .select("id, customer_name, estimate_number, scheduled_date, arrival_start, work_status, created_at")
          .or("scheduled_date.is.null,arrival_start.is.null")
          .not("work_status", "in", "(won,lost,canceled,cancelled)")
          .gte("created_at", APP_ACTION_GO_LIVE_ISO)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const readyToScheduleResult = results[0];
      const pastDueResult = results[1];
      const newLeadsResult = results[2];
      const estimateResponsesResult = results[3];
      const readyEstimatesResult = results[4];

      const readyToSchedule: StackItem[] = [];
      const pastDue: StackItem[] = [];
      const newLeads: StackItem[] = [];
      let estimateResponses: StackItem[] = [];

      // Process Ready to Schedule (jobs)
      if (readyToScheduleResult.status === "fulfilled" && !readyToScheduleResult.value.error) {
        const jobs = (readyToScheduleResult.value.data as any[]) || [];
        readyToSchedule.push(
          ...jobs.map((job: any) => {
            const typeLabel = job.job_type ? job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1) : "";
            // 2026-05-04 v2: Surface the captured date in the subtitle when JARVIS
            // got a date but no specific time. Helps the dispatcher prioritize
            // ("oh, Wednesday is busy already") at a glance.
            const dateLabel = job.scheduled_date
              ? new Date(`${job.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · needs time"
              : "Needs date + time";
            const subtitle = typeLabel ? `${typeLabel} · ${dateLabel}` : dateLabel;
            return {
              id: job.id,
              kind: "ready_to_schedule" as const,
              title: job.customer_name || `Job #${job.id.slice(0, 8)}`,
              subtitle,
              sortKey: new Date(job.created_at).getTime(),
              target: `/jobs/${job.id}`,
            };
          })
        );
      } else {
        errors.push("Ready to Schedule");
      }

      // Process Ready to Schedule (estimates) — same shape, different target route
      if (readyEstimatesResult.status === "fulfilled" && !readyEstimatesResult.value.error) {
        const estimates = (readyEstimatesResult.value.data as any[]) || [];
        readyToSchedule.push(
          ...estimates.map((est: any) => {
            const dateLabel = est.scheduled_date
              ? new Date(`${est.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · needs time"
              : "Needs date + time";
            const num = est.estimate_number ? `Est #${est.estimate_number}` : `Est #${String(est.id).slice(0, 8)}`;
            return {
              id: est.id,
              kind: "ready_to_schedule" as const,
              title: est.customer_name || num,
              subtitle: `Estimate · ${dateLabel}`,
              sortKey: new Date(est.created_at).getTime(),
              target: `/estimates/${est.id}`,
            };
          })
        );
      } else {
        errors.push("Ready to Schedule (estimates)");
      }

      // Process Past Due
      if (pastDueResult.status === "fulfilled" && !pastDueResult.value.error) {
        const jobs = (pastDueResult.value.data as any[]) || [];
        pastDue.push(
          ...jobs.map((job: any) => {
            const overdueDays = Math.floor((new Date().getTime() - new Date(job.scheduled_date).getTime()) / (1000 * 60 * 60 * 24));
            return {
              id: job.id,
              kind: "past_due" as const,
              title: job.customer_name || `Job #${job.id.slice(0, 8)}`,
              subtitle:
                job.job_type && overdueDays > 0
                  ? `${job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1)} · ${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`
                  : job.job_type
                    ? `${job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1)}`
                    : undefined,
              sortKey: new Date(job.scheduled_date).getTime(),
              target: `/jobs/${job.id}`,
            };
          })
        );
      } else {
        errors.push("Past Due");
      }

      // Process New Leads
      if (newLeadsResult.status === "fulfilled" && !newLeadsResult.value.error) {
        const leads = (newLeadsResult.value.data as any[]) || [];
        newLeads.push(
          ...leads.map((lead: any) => ({
            id: lead.id,
            kind: "new_lead" as const,
            title: lead.customer_name || `Lead #${lead.id.slice(0, 8)}`,
            subtitle: `New lead`,
            sortKey: new Date(lead.created_at).getTime(),
            target: `/quick-quote?customer_name=${encodeURIComponent(lead.customer_name || "")}`,
          }))
        );
      } else {
        errors.push("New Leads");
      }

      // Process Estimate Responses — fetch responses, then join to estimates to filter by work_status
      if (estimateResponsesResult.status === "fulfilled" && !estimateResponsesResult.value.error) {
        const responses = (estimateResponsesResult.value.data as any[]) || [];
        if (responses.length > 0) {
          const estIds = [...new Set(responses.map((r: any) => r.estimate_id))];
          try {
            const { data: ests, error: estErr } = await supabase
              .from("estimates")
              .select("id, customer_name, estimate_number, work_status, created_at")
              .in("id", estIds);

            if (!estErr && ests) {
              const unactedEstIds = new Set(
                (ests as any[]).filter((e: any) => !["won", "lost"].includes(e.work_status)).map((e: any) => e.id)
              );

              estimateResponses = responses
                .filter((r: any) => unactedEstIds.has(r.estimate_id))
                .map((resp: any) => {
                  const est = (ests as any[]).find((e: any) => e.id === resp.estimate_id);
                  return {
                    id: resp.id,
                    kind: "estimate_response" as const,
                    title: est?.customer_name || `Estimate #${est?.estimate_number || resp.estimate_id.slice(0, 8)}`,
                    subtitle: `Awaiting decision`,
                    sortKey: est ? new Date(est.created_at).getTime() : 0,
                    target: `/quick-quote?estimate_id=${resp.estimate_id}&customer_name=${encodeURIComponent(est?.customer_name || "")}`,
                  };
                });
            }
          } catch (e) {
            console.error("[useDispatchStack] Customer responses join failed:", e);
            errors.push("Customer Decisions");
          }
        }
      } else {
        errors.push("Customer Decisions");
      }

      return {
        readyToSchedule,
        pastDue,
        newLeads,
        estimateResponses,
        errors,
      };
    },
  });

  // 2026-05-04 fix: useRealtimeInvalidation takes an ARRAY of subscriptions
  // and an optional channel name, not an options object. The earlier shape
  // crashed at runtime with "s.current.map is not a function" because the
  // hook tries to .map over the first argument.
  useRealtimeInvalidation(
    [
      { table: "jobs", queryKeys: [["dispatch-stack"]] },
      { table: "leads", queryKeys: [["dispatch-stack"]] },
      { table: "estimates", queryKeys: [["dispatch-stack"]] },
      { table: "estimate_responses", queryKeys: [["dispatch-stack"]] },
    ],
    "dispatch-stack-realtime"
  );

  return {
    readyToSchedule: data?.readyToSchedule || [],
    pastDue: data?.pastDue || [],
    newLeads: data?.newLeads || [],
    estimateResponses: data?.estimateResponses || [],
    isLoading,
    isError,
    errors: data?.errors || [],
  };
}
