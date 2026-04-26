import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCustomerJobs(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-jobs", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, job_type, status, scheduled_date, address, assigned_to, customer_name")
        .eq("customer_id", customerId!)
        .order("scheduled_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCustomerEstimates(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-estimates", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("id, estimate_number, work_status, scheduled_date, address, assigned_to, description, options, created_at")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCustomerInvoices(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-invoices", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      // Get all job IDs for this customer first
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id")
        .eq("customer_id", customerId!);
      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map((j) => j.id);
      const { data, error } = await supabase
        .from("customer_invoices")
        .select("id, invoice_number, status, total, created_at, paid_at, job_id, customer_invoice_items(id, description, quantity, unit_price, total, sort_order)")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// Aggregated photos across all customer jobs (attachments + tech form photos)
export function useCustomerPhotos(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-photos", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      // Get all jobs for this customer (with details so we can label photos)
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id, job_number, hcp_job_number, job_type, scheduled_date, description")
        .eq("customer_id", customerId!);
      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map((j) => j.id);
      const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));

      // Fetch legacy attachments
      const { data: attachments, error: attErr } = await supabase
        .from("job_attachments")
        .select("id, file_name, file_path, file_type, job_id, created_at")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });
      if (attErr) throw attErr;

      const attachmentPhotos = (attachments || []).map((p) => {
        const j = jobMap[p.job_id] as any;
        return {
          ...p,
          url: supabase.storage.from("job-photos").getPublicUrl(p.file_path).data.publicUrl,
          source: "attachment" as const,
          photo_type: null as string | null,
          job_number: j?.job_number || j?.hcp_job_number || null,
          job_type: j?.job_type || null,
          scheduled_date: j?.scheduled_date || null,
          job_description: j?.description || null,
        };
      });

      // Fetch tech form photos
      const { data: forms } = await supabase
        .from("tech_forms")
        .select("id, job_id")
        .in("job_id", jobIds);

      let techPhotosMapped: any[] = [];
      if (forms && forms.length > 0) {
        const formIds = forms.map((f) => f.id);
        const formJobMap = Object.fromEntries(forms.map((f) => [f.id, f.job_id]));

        const { data: techPhotos } = await supabase
          .from("tech_form_photos")
          .select("id, file_path, photo_type, tech_form_id, created_at")
          .in("tech_form_id", formIds)
          .order("created_at", { ascending: false });

        techPhotosMapped = (techPhotos || []).map((p) => {
          const jobId = formJobMap[p.tech_form_id] || null;
          const j = jobId ? (jobMap[jobId] as any) : null;
          return {
            id: p.id,
            file_name: p.file_path.split("/").pop() || "photo",
            file_path: p.file_path,
            file_type: "image/jpeg",
            job_id: jobId,
            created_at: p.created_at,
            url: supabase.storage.from("tech-form-photos").getPublicUrl(p.file_path).data.publicUrl,
            source: "tech_form" as const,
            photo_type: p.photo_type,
            job_number: j?.job_number || j?.hcp_job_number || null,
            job_type: j?.job_type || null,
            scheduled_date: j?.scheduled_date || null,
            job_description: j?.description || null,
          };
        });
      }

      // Merge and sort by date descending
      return [...techPhotosMapped, ...attachmentPhotos].sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });
    },
  });
}

// Summary stats for the customer list cards
export function useCustomerJobCounts() {
  return useQuery({
    queryKey: ["customer-job-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_job_counts" as any).limit(5000);
      if (error) throw error;

      const counts: Record<string, { count: number; lastDate: string | null }> = {};
      for (const row of (data as any[]) || []) {
        counts[row.customer_id] = {
          count: Number(row.job_count),
          lastDate: row.last_job_date,
        };
      }
      return counts;
    },
  });
}

/** Returns a Set of customer_ids that have at least one active (non-terminal) job */
export function useActiveJobCustomerIds() {
  return useQuery({
    queryKey: ["active-job-customer-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("customer_id")
        .not("status", "in", '("done","invoiced","canceled","completed")')
        .not("customer_id", "is", null);
      if (error) throw error;
      return new Set((data || []).map((r: any) => r.customer_id));
    },
    refetchInterval: 60000,
  });
}
