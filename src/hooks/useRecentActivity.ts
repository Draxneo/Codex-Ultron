import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

export interface RecentActivityItem {
  id: string;
  kind: "call" | "sms" | "job";
  subtype?: string; // missed_call, inbound_sms, open_job, etc.
  contact_name: string;
  preview: string;
  created_at: string;
  customer_id: string | null;
  job_id: string | null;
  phone: string | null;
  address: string | null;
}

export interface RecentActivityBuckets {
  jobs: RecentActivityItem[];
  sms: RecentActivityItem[];
  calls: RecentActivityItem[];
}

/**
 * Recent customer touchpoints split into 3 channel buckets:
 *   jobs  — active/open jobs (with address)
 *   sms   — most recent SMS conversations
 *   calls — most recent phone calls (missed flagged)
 *
 * Used by JARVIS chat to seed context with one-click selectors.
 */
export function useRecentActivity(limit = 8) {
  return useQuery({
    queryKey: ["jarvis-recent-activity-buckets", limit],
    queryFn: async (): Promise<RecentActivityBuckets> => {
      const [calls, sms, jobs] = await Promise.all([
        supabase
          .from("call_log")
          .select("id, contact_name, phone_number, created_at, related_customer_id, related_job_id, direction, ai_summary, transcription, duration_seconds")
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("sms_log")
          .select("id, contact_name, phone_number, body, created_at, direction, related_job_id")
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("jobs")
          .select("id, customer_name, customer_phone, customer_id, address, hcp_job_number, job_type, status, description, created_at, scheduled_date")
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      if (calls.error) throw calls.error;
      if (sms.error) throw sms.error;
      if (jobs.error) throw jobs.error;

      // Lookup addresses for unique customer_ids that came from calls/sms
      const phoneSet = new Set<string>();
      for (const c of calls.data ?? []) if (c.phone_number) phoneSet.add(c.phone_number);
      for (const s of sms.data ?? []) if (s.phone_number) phoneSet.add(s.phone_number);

      const phoneToAddress = new Map<string, string>();
      if (phoneSet.size) {
        const { data: custs } = await supabase
          .from("customers")
          .select("phone, mobile_phone, address, city, state")
          .or(
            Array.from(phoneSet)
              .map((p) => `phone.eq.${p},mobile_phone.eq.${p}`)
              .join(",")
          );
        for (const c of custs ?? []) {
          const addr = [c.address, c.city, c.state].filter(Boolean).join(", ");
          if (c.phone && addr) phoneToAddress.set(c.phone, addr);
          if (c.mobile_phone && addr) phoneToAddress.set(c.mobile_phone, addr);
        }
      }

      const callItems: RecentActivityItem[] = (calls.data ?? []).map((c) => {
        const isMissed = c.direction === "inbound" && (c.duration_seconds ?? 0) < 5;
        return {
          id: `call-${c.id}`,
          kind: "call",
          subtype: isMissed ? "missed_call" : c.direction === "inbound" ? "inbound_call" : "outbound_call",
          contact_name: c.contact_name || c.phone_number || "Unknown",
          preview: c.ai_summary || (c.transcription?.slice(0, 80) ?? `${c.direction} call`),
          created_at: c.created_at,
          customer_id: c.related_customer_id,
          job_id: c.related_job_id,
          phone: c.phone_number,
          address: c.phone_number ? phoneToAddress.get(c.phone_number) ?? null : null,
        };
      });

      const smsItems: RecentActivityItem[] = (sms.data ?? []).map((s) => ({
        id: `sms-${s.id}`,
        kind: "sms",
        subtype: s.direction === "inbound" ? "inbound_sms" : "outbound_sms",
        contact_name: s.contact_name || s.phone_number || "Unknown",
        preview: (s.body ?? "").slice(0, 80),
        created_at: s.created_at,
        customer_id: null,
        job_id: s.related_job_id ?? null,
        phone: s.phone_number,
        address: s.phone_number ? phoneToAddress.get(s.phone_number) ?? null : null,
      }));

      const jobItems: RecentActivityItem[] = (jobs.data ?? []).map((j) => ({
        id: `job-${j.id}`,
        kind: "job",
        subtype: "open_job",
        contact_name: j.customer_name || "Unknown",
        preview: `${j.job_type ?? "job"} • ${j.status}${j.hcp_job_number ? ` • #${j.hcp_job_number}` : ""}`,
        created_at: j.created_at,
        customer_id: j.customer_id,
        job_id: j.id,
        phone: j.customer_phone,
        address: j.address,
      }));

      return { jobs: jobItems, sms: smsItems, calls: callItems };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
