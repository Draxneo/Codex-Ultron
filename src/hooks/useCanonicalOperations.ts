import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export type QuotePipelineRow = {
  estimate_id: string;
  customer_id: string | null;
  source_job_id: string | null;
  converted_job_id: string | null;
  estimate_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address: string | null;
  estimate_type: string | null;
  status: string | null;
  total_amount: number | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  assigned_to: string | null;
  presentation_sent_at: string | null;
  customer_approved_at: string | null;
  brochure_sent: boolean | null;
  created_at: string;
  latest_communication_at: string | null;
  latest_communication_type: string | null;
  latest_communication_summary: string | null;
  pipeline_stage: string | null;
};

export type CustomerTimelineRow = {
  timeline_id: string;
  event_at: string;
  event_group: "communication" | "work" | "quote" | "money" | "file" | string;
  event_type: string;
  customer_id: string | null;
  customer_name: string | null;
  phone_number: string | null;
  job_id: string | null;
  estimate_id: string | null;
  title: string;
  body: string | null;
  metadata: Record<string, any> | null;
};

export type TechWorkSummaryRow = {
  job_id: string;
  customer_id: string | null;
  job_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address: string | null;
  job_type: string | null;
  status: string | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  assigned_to: string | null;
  description: string | null;
  on_my_way_sent_at: string | null;
  arrival_time: string | null;
  photos_uploaded_at: string | null;
  completed_at: string | null;
  completion_form_sent_at: string | null;
  attachment_count: number;
  latest_attachment_at: string | null;
  estimate_count: number;
  latest_estimate_at: string | null;
  tech_next_step: string | null;
};

export function useQuotePipeline(limit = 300) {
  useRealtimeInvalidation(
    [
      { table: "estimates", queryKeys: [["quote-pipeline-read-model"]] },
      { table: "sms_log", queryKeys: [["quote-pipeline-read-model"]] },
      { table: "call_log", queryKeys: [["quote-pipeline-read-model"]] },
      { table: "intake_thread_status", queryKeys: [["quote-pipeline-read-model"]] },
    ],
    "quote-pipeline-read-model"
  );

  return useQuery({
    queryKey: ["quote-pipeline-read-model", limit],
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_quote_pipeline")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as QuotePipelineRow[];
    },
  });
}

export function useQuotePipelineMap(limit = 300) {
  const query = useQuotePipeline(limit);
  const byEstimateId = useMemo(() => {
    const map = new Map<string, QuotePipelineRow>();
    for (const row of query.data || []) map.set(row.estimate_id, row);
    return map;
  }, [query.data]);

  return { ...query, byEstimateId };
}

export function useCustomerTimeline(customerId: string | undefined, limit = 80) {
  useRealtimeInvalidation(
    customerId
      ? [
          { table: "jobs", queryKeys: [["customer-timeline-read-model", customerId]] },
          { table: "estimates", queryKeys: [["customer-timeline-read-model", customerId]] },
          { table: "customer_invoices", queryKeys: [["customer-timeline-read-model", customerId]] },
          { table: "job_attachments", queryKeys: [["customer-timeline-read-model", customerId]] },
          { table: "sms_log", queryKeys: [["customer-timeline-read-model", customerId]] },
          { table: "call_log", queryKeys: [["customer-timeline-read-model", customerId]] },
          { table: "intake_thread_status", queryKeys: [["customer-timeline-read-model", customerId]] },
        ]
      : [],
    `customer-timeline-read-model-${customerId || "none"}`
  );

  return useQuery({
    queryKey: ["customer-timeline-read-model", customerId, limit],
    enabled: !!customerId,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_customer_timeline")
        .select("*")
        .eq("customer_id", customerId!)
        .order("event_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as CustomerTimelineRow[];
    },
  });
}

export function useTechWorkSummary(jobIds: string[] = []) {
  const stableJobIds = useMemo(() => Array.from(new Set(jobIds.filter(Boolean))).sort(), [jobIds]);
  const jobKey = stableJobIds.join("|");

  useRealtimeInvalidation(
    stableJobIds.length
      ? [
          { table: "jobs", queryKeys: [["tech-work-summary-read-model"]] },
          { table: "job_attachments", queryKeys: [["tech-work-summary-read-model"]] },
          { table: "estimates", queryKeys: [["tech-work-summary-read-model"]] },
        ]
      : [],
    "tech-work-summary-read-model"
  );

  return useQuery({
    queryKey: ["tech-work-summary-read-model", jobKey],
    enabled: stableJobIds.length > 0,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_tech_work_summary")
        .select("*")
        .in("job_id", stableJobIds);
      if (error) throw error;
      return (data || []) as TechWorkSummaryRow[];
    },
  });
}
