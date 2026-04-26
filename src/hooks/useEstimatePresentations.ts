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
  estimate_id: string;
  presentation_id: string;
  action: "approved" | "changes_requested" | "declined";
  message?: string;
  payment_preference?: string;
  selected_tier?: string;
  selected_addons?: any;
}) {
  const { error } = await supabase
    .from("estimate_responses" as any)
    .insert(params as any);
  if (error) throw error;

  // If approved, stamp customer_approved_at on the estimate
  if (params.action === "approved") {
    await supabase
      .from("estimates" as any)
      .update({ customer_approved_at: new Date().toISOString() } as any)
      .eq("id", params.estimate_id);

    // Bridge: copy approved service_repair_items → job_line_items
    await bridgeRepairApproval(params.estimate_id, params.selected_tier);
  }
}

/**
 * Repair Approval Bridge — closes the gap between service_repair_items and job_line_items.
 * When a customer approves a repair tier, copies matching service_repair_items into
 * job_line_items (the ONE SOURCE OF TRUTH for invoicing) and auto-waives the service call fee.
 */
async function bridgeRepairApproval(estimateId: string, selectedTier?: string) {
  if (!selectedTier) return;

  // 1. Get the source job from the estimate
  const { data: estimate } = await supabase
    .from("estimates" as any)
    .select("source_job_id, estimate_type")
    .eq("id", estimateId)
    .single();

  const est = estimate as any;
  if (!est?.source_job_id || est.estimate_type !== "service_repair") return;

  const jobId = est.source_job_id;

  // 2. Determine which severity tiers are included
  // "necessary" = just necessary, "recommended" = necessary + recommended, "deluxe" = all
  const tierMap: Record<string, string[]> = {
    necessary: ["necessary"],
    recommended: ["necessary", "recommended"],
    deluxe: ["necessary", "recommended", "deluxe"],
  };
  const includedSeverities = tierMap[selectedTier] || [selectedTier];

  // 3. Fetch matching service_repair_items
  const { data: repairItems } = await supabase
    .from("service_repair_items" as any)
    .select("*")
    .eq("job_id", jobId)
    .in("severity", includedSeverities);

  if (!repairItems || (repairItems as any[]).length === 0) return;

  // 4. Mark them as approved
  const repairIds = (repairItems as any[]).map((r: any) => r.id);
  await supabase
    .from("service_repair_items" as any)
    .update({ approved: true } as any)
    .in("id", repairIds);

  // 5. Get current max sort_order in job_line_items
  const { data: existingItems } = await supabase
    .from("job_line_items" as any)
    .select("id, sort_order, description, waived")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: false })
    .limit(1);

  let nextSort = ((existingItems as any)?.[0]?.sort_order ?? 0) + 1;

  // 6. Insert approved repair items into job_line_items
  const newLineItems = (repairItems as any[]).map((item: any, i: number) => ({
    job_id: jobId,
    description: item.description,
    quantity: 1,
    unit_price: item.final_price,
    total: item.final_price,
    sort_order: nextSort + i,
    template_id: null, // dynamic repair item, not from catalog
    waived: false,
  }));

  await supabase.from("job_line_items" as any).insert(newLineItems as any);

  // 7. Auto-waive service call fee (if repair items are being added)
  const { data: allLineItems } = await supabase
    .from("job_line_items" as any)
    .select("id, description, waived")
    .eq("job_id", jobId);

  const serviceCallItem = (allLineItems as any[])?.find(
    (li: any) => !li.waived && li.description?.toLowerCase().includes("service call")
  );

  if (serviceCallItem) {
    await supabase
      .from("job_line_items" as any)
      .update({ waived: true, waived_reason: "Waived with repair" } as any)
      .eq("id", serviceCallItem.id);
  }
}
