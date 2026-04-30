import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatJobData } from "@/lib/formatters";
import { paymentPreferenceLabel } from "@/lib/paymentOptions";
import { toast } from "sonner";

export interface Estimate {
  id: string;
  hcp_id: string | null;
  estimate_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address: string | null;
  assigned_to: string | null;
  work_status: string | null;
  scheduled_date: string | null;
  description: string | null;
  hcp_customer_id: string | null;
  options: any;
  synced_at: string | null;
  created_at: string;
  arrival_start: string | null;
  arrival_end: string | null;
  confirmation_sent_at: string | null;
  dispatch_sent_at: string | null;
  on_my_way_sent_at: string | null;
  completion_form_sent_at: string | null;
  brochure_sent: boolean | null;
  presentation_sent_at: string | null;
  customer_approved_at: string | null;
  status: string | null;
}

const ESTIMATE_LIST_FIELDS = "id, hcp_id, estimate_number, customer_id, customer_name, customer_phone, customer_email, address, assigned_to, work_status, scheduled_date, description, hcp_customer_id, options, created_at, arrival_start, arrival_end, status, confirmation_sent_at, dispatch_sent_at, on_my_way_sent_at, completion_form_sent_at, brochure_sent, presentation_sent_at, customer_approved_at";
const TERMINAL_ESTIMATE_WORK_STATUSES = '("won","lost","canceled","cancelled","completed","complete","closed","legacy_complete","created job from estimate","pro canceled","user canceled","complete rated","complete unrated")';

export function useEstimates(showLost = false) {
  return useQuery({
    queryKey: ["estimates", { showLost }],
    queryFn: async () => {
      if (showLost) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoffDate = ninetyDaysAgo.toISOString().split("T")[0];

        const { data, error } = await supabase
          .from("estimates" as any)
          .select(ESTIMATE_LIST_FIELDS)
          .not("scheduled_date", "is", null)
          .gte("scheduled_date", cutoffDate)
          .order("scheduled_date", { ascending: false });
        if (error) throw error;
        return data as unknown as Estimate[];
      }

      const query = supabase
        .from("estimates" as any)
        .select(ESTIMATE_LIST_FIELDS)
        .not("work_status", "in", TERMINAL_ESTIMATE_WORK_STATUSES)
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Estimate[];
    },
  });
}
export function useEstimate(id: string | undefined) {
  return useQuery({
    queryKey: ["estimates", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as Estimate;
    },
  });
}

export function useUpdateEstimateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("estimates" as any)
        .update({ work_status: status } as any)
        .eq("id", id);
      if (error) throw error;

      // Fix #1/#2: Auto-create a job when estimate is marked "Won"
      if (status === "won") {
        try {
          await createJobFromEstimate(id);
        } catch (e) {
          console.error("Auto-create job from estimate failed:", e);
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      if (status === "won") {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      }
    },
  });
}

export function useUpdateEstimate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Record<string, any>;
    }) => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Estimate;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["estimates", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["attention-data"] });
      if ((data as any)?.customer_id) {
        queryClient.invalidateQueries({ queryKey: ["customer-overview", (data as any).customer_id] });
      }
      toast.success("Estimate updated");
    },
    onError: (err: any) => {
      toast.error("Error updating estimate", { description: err.message });
    },
  });
}

/** Create a job from a won estimate, carrying over all customer data + context */
async function createJobFromEstimate(estimateId: string) {
  // Fetch estimate data
  const { data: estRaw, error: estErr } = await supabase
    .from("estimates" as any)
    .select("*")
    .eq("id", estimateId)
    .single();
  if (estErr || !estRaw) throw estErr || new Error("Estimate not found");
  const est = estRaw as any;

  // Fetch the review to carry over selected tiers & payment preference
  const { data: reviews } = await supabase
    .from("estimate_reviews")
    .select("selected_tiers, payment_preference, admin_notes")
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: false })
    .limit(1);
  const review = reviews?.[0];

  // Fetch the customer's direct response (takes priority over review defaults)
  const { data: responses } = await supabase
    .from("estimate_responses" as any)
    .select("payment_preference, selected_tier, selected_addons, message")
    .eq("estimate_id", estimateId)
    .eq("action", "approved")
    .order("responded_at", { ascending: false })
    .limit(1);
  const customerResponse = (responses as any)?.[0];

  // ── FIX #3: Resolve customer_id from estimate or by phone/email lookup ──
  let customerId: string | null = est.customer_id || null;
  if (!customerId && (est.customer_phone || est.customer_email)) {
    // Try to find existing customer by phone or email
    const custQuery = supabase.from("customers").select("id").limit(1);
    if (est.customer_phone) {
      const normalized = est.customer_phone.replace(/\D/g, "").slice(-10);
      // Search by phone or mobile
      const { data: phoneCust } = await supabase
        .from("customers")
        .select("id")
        .or(`phone.ilike.%${normalized}%,mobile_phone.ilike.%${normalized}%`)
        .limit(1);
      if (phoneCust?.[0]) customerId = phoneCust[0].id;
    }
    if (!customerId && est.customer_email) {
      const { data: emailCust } = await supabase
        .from("customers")
        .select("id")
        .eq("email", est.customer_email)
        .limit(1);
      if (emailCust?.[0]) customerId = emailCust[0].id;
    }
    if (!customerId && est.hcp_customer_id) {
      const { data: hcpCust } = await supabase
        .from("customers")
        .select("id")
        .eq("hcp_customer_id", est.hcp_customer_id)
        .limit(1);
      if (hcpCust?.[0]) customerId = hcpCust[0].id;
    }
  }

  // Build description with estimate context
  const descParts: string[] = [];
  if (est.description) descParts.push(est.description);
  if (customerResponse?.selected_tier) descParts.push(`Customer selected: ${customerResponse.selected_tier}`);
  else if (review?.selected_tiers && Array.isArray(review.selected_tiers) && review.selected_tiers.length) descParts.push(`Selected tiers: ${(review.selected_tiers as string[]).join(", ")}`);
  // Customer's payment choice takes priority over review's default
  const paymentPref = customerResponse?.payment_preference || review?.payment_preference;
  if (paymentPref) {
    descParts.push(`Payment: ${paymentPreferenceLabel(paymentPref)}`);
  }
  if (customerResponse?.selected_addons && Array.isArray(customerResponse.selected_addons) && customerResponse.selected_addons.length > 0) {
    descParts.push(`Add-ons: ${customerResponse.selected_addons.join(", ")}`);
  }
  if (review?.admin_notes) descParts.push(`Admin notes: ${review.admin_notes}`);
  if (customerResponse?.message) descParts.push(`Customer notes: ${customerResponse.message}`);

  // Determine if this was a phone sale (no on-site visit)
  const saleSource = est.sale_source || "on_site";
  const siteVisitMissing = saleSource === "phone";

  // Resolve orientation from estimate's tech form responses
  let orientation: string | null = null;
  try {
    const { data: estForms } = await supabase.from("tech_forms").select("id").eq("job_id", estimateId);
    if (estForms && estForms.length > 0) {
      const { data: locResponse } = await supabase
        .from("tech_form_responses")
        .select("value")
        .in("tech_form_id", estForms.map(f => f.id))
        .in("field_id", await supabase.from("tech_form_fields").select("id").in("label", ["Where is the system?", "Install Location"]).then(r => (r.data || []).map((f: any) => f.id)))
        .limit(1);
      if (locResponse?.[0]?.value) {
        const val = locResponse[0].value;
        if (/horizontal|attic/i.test(val)) orientation = "Horizontal";
        else if (/vertical|closet/i.test(val)) orientation = "Vertical";
      }
    }
  } catch { /* non-critical */ }

  const jobData: Record<string, any> = {
    customer_name: est.customer_name,
    customer_phone: est.customer_phone,
    customer_email: est.customer_email,
    customer_id: customerId,
    address: est.address,
    assigned_to: est.assigned_to,
    job_type: "install",
    status: "new",
    description: descParts.join("\n") || null,
    estimate_id: estimateId,
    hcp_customer_id: est.hcp_customer_id,
    payment_method:
      paymentPref === "financing_36mo" || paymentPref === "financing_120mo"
        ? "financed"
        : paymentPref === "factory_rebate" || paymentPref === "pay_in_full" || paymentPref === "cash"
          ? "factory_rebate"
          : paymentPref || null,
    sale_source: saleSource,
    site_visit_missing: siteVisitMissing,
    orientation,
  };

  const { data: newJob, error: jobErr } = await supabase
    .from("jobs")
    .insert(formatJobData(jobData))
    .select()
    .single();
  if (jobErr) throw jobErr;

  // Centralized post-creation: format, chat, line items, HCP, activity log
  try {
    await supabase.functions.invoke("finalize-job", {
      body: { job_id: newJob.id, created_by: "EstimateConversion" },
    });
  } catch (e) {
    console.error("finalize-job error:", e);
  }

  // Re-link any tech_forms from the estimate to the new install job
  // This carries forward photos, equipment data, and notes from the sales visit
  try {
    const { data: estimateForms } = await supabase
      .from("tech_forms" as any)
      .select("id")
      .eq("job_id", estimateId);
    if (estimateForms && estimateForms.length > 0) {
      const formIds = estimateForms.map((f: any) => f.id);
      await supabase
        .from("tech_forms" as any)
        .update({ job_id: newJob.id } as any)
        .in("id", formIds);
      console.log(`Re-linked ${formIds.length} tech form(s) from estimate ${estimateId} to job ${newJob.id}`);
    }
  } catch (e) {
    console.warn("Failed to re-link tech forms from estimate:", e);
  }

  toast.success(`Job created from estimate #${est.estimate_number || "—"}`, {
    description: `Job #${newJob.job_number || "—"} auto-created${siteVisitMissing ? " ⚠️ No site visit" : ""}`,
  });
}

export function useCreateEstimate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (estimate: Partial<Estimate>) => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .insert(formatJobData(estimate as Record<string, any>) as any)
        .select()
        .single();
      if (error) throw error;
      const created = data as unknown as Estimate;

      // Run shared local finalization side effects such as chat channels and activity.
      try {
        await supabase.functions.invoke("finalize-job", {
          body: { estimate_id: created.id, created_by: "UI" },
        });
      } catch (e) {
        console.error("finalize-job (estimate) error:", e);
      }

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
    },
  });
}

/** Hook to fetch tasks for an estimate — legacy, returns empty */
export function useEstimateTasks(estimateId?: string) {
  return useQuery({
    queryKey: ["estimate_tasks", estimateId],
    enabled: false,
    queryFn: async () => [] as any[],
  });
}

/** @deprecated Legacy task auto-complete removed */
export async function autoCompleteEstimateTask(
  _estimateId: string,
  _titleMatch: string,
  _completedBy: string,
  _notes: string,
): Promise<string[]> {
  return [];
}
