import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Pull structured tech-form responses for an estimate to feed the sales presentation */
export function useEstimateFormData(estimateId: string | undefined) {
  return useQuery({
    queryKey: ["estimate_form_data", estimateId],
    enabled: !!estimateId,
    queryFn: async () => {
      // Get the tech_form linked to this estimate's job (or the estimate itself)
      const { data: forms } = await supabase
        .from("tech_forms" as any)
        .select("id, job_id")
        .or(`job_id.eq.${estimateId},job_id.in.(select id from jobs where estimate_id='${estimateId}')`)
        .order("created_at", { ascending: false })
        .limit(1);

      const formId = (forms as any)?.[0]?.id;
      if (!formId) return null;

      // Get all responses for this form
      const { data: responses } = await supabase
        .from("tech_form_responses" as any)
        .select("field_id, value, tech_form_fields!inner(label, field_type, step_group)")
        .eq("tech_form_id", formId);

      // Get extracted photo data (gauges, capacitors, etc.)
      const { data: photos } = await supabase
        .from("tech_form_photos" as any)
        .select("photo_type, extraction_status, extracted_model, extracted_serial, extracted_items, extracted_suction, extracted_discharge, extracted_uf, extracted_vac, extracted_filter_size, extracted_filter_condition")
        .eq("tech_form_id", formId)
        .eq("extraction_status", "done");

      // Build structured data map
      const fieldMap: Record<string, any> = {};
      for (const r of (responses || []) as any[]) {
        const label = r.tech_form_fields?.label;
        if (label) fieldMap[label] = r.value;
      }

      return {
        formId,
        responses: fieldMap,
        photos: (photos || []) as any[],
        currentSystemAge: fieldMap["Current System Age"] || null,
        whyReplacing: fieldMap["Why Replacing?"] || null,
        systemSize: fieldMap["What size system?"] || null,
        systemType: fieldMap["System Type"] || null,
        equipmentLocation: fieldMap["Where is the system?"] || null,
        sqFootage: fieldMap["Home Sq Footage"] || null,
        ductworkCondition: fieldMap["Ductwork Condition"] || null,
        insulationQuality: fieldMap["Insulation Quality"] || null,
        windowType: fieldMap["Window Type"] || null,
        isPublicServant: fieldMap["Customer is a public servant (military, first responder, teacher, nurse)"] === "true",
        tiersToPresent: fieldMap["Tiers to present to customer"] || null,
        gaugeReadings: (photos as any[])?.find((p: any) => p.photo_type === "gauge_reading") || null,
        capacitorReading: (photos as any[])?.find((p: any) => p.photo_type === "capacitor_reading") || null,
        filterAssessment: (photos as any[])?.find((p: any) => p.photo_type === "filter_assessment") || null,
      };
    },
  });
}

export interface EstimatePresentation {
  id: string;
  estimate_id: string;
  token: string;
  customer_email: string | null;
  pricing_snapshot: any;
  selected_tiers: string[];
  created_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  estimate?: any;
  blocks?: any[];
  comparisonBlocks?: any[];
  addons?: any[];
  memberInfo?: { hasAgreement: boolean; discountPercent?: number; planName?: string };
  diagnosisPhotos?: { url: string; label?: string }[];
}

export interface EstimateResponse {
  id: string;
  estimate_id: string;
  presentation_id: string | null;
  action: "approved" | "changes_requested" | "declined";
  message: string | null;
  payment_preference: string | null;
  selected_tier: string | null;
  selected_addons: any | null;
  responded_at: string;
}

export interface EstimateApprovalEvent {
  id: string;
  estimate_id: string;
  source_job_id: string | null;
  authorized_job_id: string | null;
  presentation_id: string | null;
  job_cart_id: string | null;
  approval_method: "digital" | "verbal" | "office" | "import";
  approval_status: "approved" | "declined" | "changes_requested" | "revoked";
  selected_option_key: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  actor_type: "customer" | "technician" | "office" | "system";
  recorded_by: string | null;
  recorded_by_name: string | null;
  note: string | null;
  approved_scope_snapshot: any;
  metadata: any;
  approved_at: string;
  created_at: string;
}

export function usePresentationsForEstimate(estimateId: string | undefined) {
  return useQuery({
    queryKey: ["estimate_presentations", estimateId],
    enabled: !!estimateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_presentations" as any)
        .select("*")
        .eq("estimate_id", estimateId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EstimatePresentation[];
    },
  });
}

export function useEstimateApprovalEvents(estimateId: string | undefined) {
  return useQuery({
    queryKey: ["estimate_approval_events", estimateId],
    enabled: !!estimateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_approval_events" as any)
        .select("*")
        .eq("estimate_id", estimateId!)
        .order("approved_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EstimateApprovalEvent[];
    },
  });
}

export function useRecordVerbalEstimateApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      estimate_id: string;
      note?: string;
      selected_option_key?: string | null;
      payment_method?: string | null;
      recorded_by_name?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("record_estimate_approval_event" as any, {
        p_estimate_id: params.estimate_id,
        p_approval_method: "verbal",
        p_approval_status: "approved",
        p_selected_option_key: params.selected_option_key || null,
        p_payment_method: params.payment_method || null,
        p_note: params.note || "Customer verbally approved the proposed work.",
        p_recorded_by_name: params.recorded_by_name || null,
        p_actor_type: "office",
        p_presentation_id: null,
        p_job_cart_id: null,
        p_scope_snapshot: {},
        p_metadata: { source: "estimate_detail_verbal_approval" },
      });
      if (error) throw error;

      const { error: responseError } = await supabase
        .from("estimate_responses" as any)
        .insert({
          estimate_id: params.estimate_id,
          action: "approved",
          message: params.note || "Customer verbally approved the proposed work.",
          payment_preference: params.payment_method || null,
          selected_tier: params.selected_option_key || null,
        });
      if (responseError) throw responseError;

      return data as string;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["estimate_approval_events", vars.estimate_id] });
      queryClient.invalidateQueries({ queryKey: ["estimate_responses", vars.estimate_id] });
      queryClient.invalidateQueries({ queryKey: ["estimates", vars.estimate_id] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["quote-pipeline-read-model"] });
    },
  });
}

export function useResponsesForEstimate(estimateId: string | undefined) {
  return useQuery({
    queryKey: ["estimate_responses", estimateId],
    enabled: !!estimateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_responses" as any)
        .select("*")
        .eq("estimate_id", estimateId!)
        .order("responded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EstimateResponse[];
    },
  });
}

export function useCreatePresentation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      estimate_id: string;
      customer_email: string;
      pricing_snapshot: any;
      selected_tiers: string[];
    }) => {
      const { data, error } = await supabase
        .from("estimate_presentations" as any)
        .insert(params as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as EstimatePresentation;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["estimate_presentations", vars.estimate_id] });
    },
  });
}

export function usePresentationByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["presentation_by_token", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_public_estimate_presentation" as any, { p_token: token! });
      if (error) throw error;
      if (!data) throw new Error("Presentation not found");
      return data as unknown as EstimatePresentation;
    },
  });
}

/** Record a view — stamps first_viewed_at and increments view_count */
export async function recordPresentationView(presentationToken: string) {
  await supabase.rpc("track_estimate_presentation_view" as any, { p_token: presentationToken });
}

/** Submit a customer response */
export async function submitEstimateResponse(params: {
  token: string;
  action: "approved" | "changes_requested" | "declined";
  message?: string;
  payment_preference?: string;
  selected_tier?: string;
  selected_addons?: any;
}) {
  const { error } = await supabase.rpc("submit_public_estimate_response" as any, {
    p_token: params.token,
    p_action: params.action,
    p_message: params.message || null,
    p_payment_preference: params.payment_preference || null,
    p_selected_tier: params.selected_tier || null,
    p_selected_addons: params.selected_addons || null,
  });
  if (error) throw error;

}
