import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";

type HistoryJob = {
  id: string;
  job_number: string | null;
  hcp_job_number?: string | null;
  job_type: string | null;
  scheduled_date: string | null;
  description?: string | null;
};

type HistoryEstimate = {
  id: string;
  estimate_number: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  description?: string | null;
};

type HistoryPhoto = {
  created_at: string | null;
};

type CustomerJobCount = {
  customer_id: string;
  job_count: number;
  last_job_date: string | null;
};

async function getCustomerHcpId(customerId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("hcp_customer_id")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.hcp_customer_id || null;
}

function customerLinkFilter(customerId: string, hcpCustomerId: string | null) {
  if (!hcpCustomerId) return `customer_id.eq.${customerId}`;
  return `customer_id.eq.${customerId},and(customer_id.is.null,hcp_customer_id.eq.${hcpCustomerId})`;
}

export function useCustomerJobs(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-jobs", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const hcpCustomerId = await getCustomerHcpId(customerId!);
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, job_type, status, scheduled_date, address, assigned_to, customer_name")
        .or(customerLinkFilter(customerId!, hcpCustomerId))
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
      const hcpCustomerId = await getCustomerHcpId(customerId!);
      const { data, error } = await supabase
        .from("estimates")
        .select("id, estimate_number, work_status, scheduled_date, address, assigned_to, description, options, created_at")
        .or(customerLinkFilter(customerId!, hcpCustomerId))
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
      const hcpCustomerId = await getCustomerHcpId(customerId!);
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id")
        .or(customerLinkFilter(customerId!, hcpCustomerId));
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
      const hcpCustomerId = await getCustomerHcpId(customerId!);
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id, job_number, hcp_job_number, job_type, scheduled_date, description")
        .or(customerLinkFilter(customerId!, hcpCustomerId));
      if (jobsError) throw jobsError;

      const typedJobs = (jobs || []) as HistoryJob[];
      const jobIds = typedJobs.map((j) => j.id);
      const jobMap = Object.fromEntries(typedJobs.map((j) => [j.id, j]));

      const { data: estimates } = await supabase
        .from("estimates")
        .select("id, estimate_number, scheduled_date, created_at, description")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      const typedEstimates = (estimates || []) as HistoryEstimate[];
      const estimateMap = Object.fromEntries(typedEstimates.map((e) => [e.id, e]));

      // Fetch attachments via TWO paths and merge:
      //   (a) photos linked to any of this customer's jobs (legacy + still-correct for
      //       most service flows that always create a job).
      //   (b) photos linked DIRECTLY to the customer via job_attachments.customer_id —
      //       handles brand-new leads who texted photos before any job exists, and
      //       photos retroactively re-pointed to the customer when a job is canceled.
      // De-duplicate by id since a single photo may match both queries.
      const [byJob, byCustomer] = await Promise.all([
        jobIds.length
          ? supabase
              .from("job_attachments")
              .select("id, file_name, file_path, file_type, job_id, estimate_id, customer_id, storage_bucket, created_at")
              .in("job_id", jobIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("job_attachments")
          .select("id, file_name, file_path, file_type, job_id, estimate_id, customer_id, storage_bucket, created_at")
          .eq("customer_id", customerId!)
          .order("created_at", { ascending: false }),
      ]);
      if ((byJob as any).error) throw (byJob as any).error;
      if ((byCustomer as any).error) throw (byCustomer as any).error;

      const attachmentRowsById = new Map<string, any>();
      for (const row of ((byJob as any).data || [])) attachmentRowsById.set(row.id, row);
      for (const row of ((byCustomer as any).data || [])) attachmentRowsById.set(row.id, row);
      const mergedAttachments = Array.from(attachmentRowsById.values());

      const attachmentPhotos = mergedAttachments.map((p: any) => {
        const j = p.job_id ? jobMap[p.job_id] : null;
        // file_path may already be a full https URL (MMS download path stored CDN URLs);
        // resolveStorageMediaUrl handles both — bucket is "job-photos" by default unless
        // the row explicitly stored a different storage_bucket.
        return {
          ...p,
          url: p.file_path?.startsWith?.("http")
            ? p.file_path
            : resolveStorageMediaUrl(p.file_path, p.storage_bucket || "job-photos"),
          source: "attachment" as const,
          photo_type: null as string | null,
          job_number: j?.job_number || j?.hcp_job_number || null,
          job_type: j?.job_type || null,
          scheduled_date: j?.scheduled_date || null,
          job_description: j?.description || null,
        };
      });

      const { data: hcpAttachments, error: hcpAttErr } = await supabase
        .from("hcp_attachments" as any)
        .select("id, source_type, file_name, file_type, storage_bucket, storage_path, customer_id, estimate_id, created_at, uploaded_at, archive_status")
        .eq("customer_id", customerId!)
        .in("source_type", ["customer", "estimate"])
        .eq("archive_status", "archived")
        .not("storage_path", "is", null)
        .order("created_at", { ascending: false });
      if (hcpAttErr) throw hcpAttErr;

      const hcpAttachmentPhotos = ((hcpAttachments || []) as any[]).map((p) => {
        const estimate = p.estimate_id ? estimateMap[p.estimate_id] : null;
        const bucket = p.storage_bucket || (p.source_type === "estimate" ? "estimate-attachments" : "customer-attachments");
        return {
          id: p.id,
          file_name: p.file_name || "attachment",
          file_path: p.storage_path,
          file_type: p.file_type,
          job_id: null,
          estimate_id: p.estimate_id || null,
          created_at: p.uploaded_at || p.created_at,
          url: resolveStorageMediaUrl(p.storage_path, bucket),
          source: "hcp_attachment" as const,
          source_type: p.source_type,
          photo_type: null as string | null,
          job_number: estimate?.estimate_number || null,
          job_type: p.source_type === "estimate" ? "Estimate" : "Customer file",
          scheduled_date: estimate?.scheduled_date || estimate?.created_at || null,
          job_description: estimate?.description || null,
        };
      });

      // Fetch tech form photos
      const { data: forms } = jobIds.length
        ? await supabase
            .from("tech_forms")
            .select("id, job_id")
            .in("job_id", jobIds)
        : { data: [] };

      let techPhotosMapped: HistoryPhoto[] = [];
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
          const j = jobId ? jobMap[jobId] : null;
          return {
            id: p.id,
            file_name: p.file_path.split("/").pop() || "photo",
            file_path: p.file_path,
            file_type: "image/jpeg",
            job_id: jobId,
            created_at: p.created_at,
            url: resolveStorageMediaUrl(p.file_path, "tech-form-photos"),
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
      return [...techPhotosMapped, ...attachmentPhotos, ...hcpAttachmentPhotos].sort((a, b) => {
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
      const { data, error } = await supabase.rpc("get_customer_job_counts").limit(5000);
      if (error) throw error;

      const counts: Record<string, { count: number; lastDate: string | null }> = {};
      for (const row of ((data || []) as CustomerJobCount[])) {
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
      return new Set((data || []).map((r) => r.customer_id));
    },
    refetchInterval: 60000,
  });
}
