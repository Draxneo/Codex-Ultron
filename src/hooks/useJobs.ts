import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type CustomerFallback = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function buildCustomerName(customer?: CustomerFallback | null) {
  if (!customer) return null;
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || null;
}

function buildCustomerAddress(customer?: CustomerFallback | null) {
  if (!customer) return null;
  return [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ") || null;
}

function mergeLinkedCustomer<T extends Record<string, any>>(job: T, customer?: CustomerFallback | null): T {
  if (!customer) return job;

  return {
    ...job,
    customer_name: job.customer_name || buildCustomerName(customer),
    customer_phone: job.customer_phone || customer.phone || customer.mobile_phone || null,
    customer_email: job.customer_email || customer.email || null,
    address: job.address || buildCustomerAddress(customer),
  };
}

async function fetchCustomersByIds(ids: string[]) {
  if (ids.length === 0) return new Map<string, CustomerFallback>();

  const uniqueIds = Array.from(new Set(ids));
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, company, email, phone, mobile_phone, address, city, state, zip")
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map((data || []).map((customer) => [customer.id, customer as CustomerFallback]));
}

/**
 * Merge customer data from the React Query cache (customer_names) when available,
 * falling back to a network fetch only when cache is cold.
 */
function mergeJobsWithCachedCustomers(
  jobs: any[],
  queryClient: ReturnType<typeof useQueryClient>
): { enriched: any[]; needsFetch: string[] } {
  const cachedNames = queryClient.getQueryData<any[]>(["customer_names"]);
  if (!cachedNames) {
    return { enriched: jobs, needsFetch: jobs.map(j => j.customer_id).filter(Boolean) };
  }

  const nameMap = new Map<string, any>();
  for (const c of cachedNames) {
    nameMap.set(c.id, c);
  }

  const enriched = jobs.map((job) => {
    const c = nameMap.get(job.customer_id);
    if (!c) return job;
    return mergeLinkedCustomer(job, c as CustomerFallback);
  });

  return { enriched, needsFetch: [] };
}

export function useJobs() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["jobs"],
    staleTime: 30000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .not("status", "in", '("canceled")')
        .or(`scheduled_date.gte.${cutoff},scheduled_date.is.null,status.in.("new","scheduled","in_progress","on_hold")`)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;

      const { enriched, needsFetch } = mergeJobsWithCachedCustomers(data || [], queryClient);
      if (needsFetch.length > 0) {
        const customerMap = await fetchCustomersByIds(needsFetch);
        return enriched.map((job) =>
          job.customer_id && customerMap.has(job.customer_id)
            ? mergeLinkedCustomer(job, customerMap.get(job.customer_id))
            : job
        );
      }
      return enriched;
    },
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["jobs", id],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      if (!data.customer_id) return data;

      const { data: customer } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company, email, phone, mobile_phone, address, city, state, zip")
        .eq("id", data.customer_id)
        .maybeSingle();

      return mergeLinkedCustomer(data, customer as CustomerFallback | null);
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
      activityDetails,
    }: {
      id: string;
      updates: Record<string, any>;
      activityDetails?: string;
    }) => {
      const { data, error } = await supabase
        .from("jobs")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (activityDetails) {
        await supabase.from("activity_log").insert({
          job_id: id,
          action: "job_updated",
          performed_by: "Office",
          details: activityDetails,
        } as any);
      }

      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["attention-data"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      if ((data as any)?.customer_id) {
        queryClient.invalidateQueries({ queryKey: ["customer-overview", (data as any).customer_id] });
      }
      toast({ title: "Job updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error updating job", description: err.message, variant: "destructive" });
    },
  });
}

export function useFollowUpJobs() {
  return useQuery({
    queryKey: ["follow_up_jobs"],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("needs_follow_up", true)
        .not("status", "in", '("done","invoiced","canceled")')
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export interface BacklogBuckets {
  readyToSchedule: any[];
  waitingOnParts: any[];
  followUp: any[];
}

export function useBacklogJobs() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["backlog_jobs"],
    staleTime: 30000,
    queryFn: async () => {
      const doneStatuses = ["done", "invoiced", "canceled", "completed"];

      // Fetch jobs that belong in any of the 3 buckets
      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("*")
        .not("status", "in", '("done","invoiced","canceled","completed")')
        .or("scheduled_date.is.null,status.eq.on_hold,needs_follow_up.eq.true")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch pending parts orders to identify waiting-on-parts jobs
      const { data: partsOrders } = await supabase
        .from("parts_orders" as any)
        .select("job_id, status")
        .in("status", ["ordered", "ready_for_pickup"]);

      const jobsWithPendingParts = new Set(
        ((partsOrders as any[]) || []).map((p: any) => p.job_id).filter(Boolean)
      );

      // Enrich with customer data (cache-first)
      const { enriched, needsFetch } = mergeJobsWithCachedCustomers(jobs || [], queryClient);
      let finalJobs = enriched;
      if (needsFetch.length > 0) {
        const customerMap = await fetchCustomersByIds(needsFetch);
        finalJobs = enriched.map((job) =>
          job.customer_id && customerMap.has(job.customer_id)
            ? mergeLinkedCustomer(job, customerMap.get(job.customer_id))
            : job
        );
      }

      // Split into 3 non-overlapping buckets (priority order matters)
      const followUp: any[] = [];
      const waitingOnParts: any[] = [];
      const readyToSchedule: any[] = [];

      for (const job of finalJobs) {
        const status = job.status?.toLowerCase?.() ?? "";
        if (doneStatuses.includes(status)) continue;

        // Bucket 1: Follow-Up (explicitly flagged)
        if (job.needs_follow_up) {
          followUp.push(job);
          continue;
        }

        // Bucket 2: Waiting on Parts (on_hold OR has pending parts orders)
        if (status === "on_hold" || jobsWithPendingParts.has(job.id)) {
          waitingOnParts.push(job);
          continue;
        }

        // Bucket 3: Ready to Schedule (unscheduled, not on hold, not follow-up)
        if (!job.scheduled_date) {
          readyToSchedule.push(job);
        }
      }

      return { readyToSchedule, waitingOnParts, followUp } as BacklogBuckets;
    },
  });
}

export function useToggleFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, followUp, reason }: { jobId: string; followUp: boolean; reason?: string }) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      const { error } = await supabase
        .from("jobs")
        .update({
          needs_follow_up: followUp,
          follow_up_reason: followUp ? (reason || null) : null,
          follow_up_next_check: followUp ? tomorrowStr : null,
          follow_up_check_count: followUp ? 0 : 0,
        })
        .eq("id", jobId);
      if (error) throw error;

    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow_up_jobs"] });
      qc.invalidateQueries({ queryKey: ["unscheduled_jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
