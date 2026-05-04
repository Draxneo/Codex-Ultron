import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { audience_id } = await req.json();
    if (!audience_id) throw new Error("audience_id required");

    const sb = getSupabaseAdmin();

    const { data: audience, error: audErr } = await sb
      .from("meta_audiences")
      .select("*")
      .eq("id", audience_id)
      .single();
    if (audErr || !audience) throw new Error("Audience not found");

    const filters = audience.filter_rules || {};

    // Build customer query
    let query = sb
      .from("customers")
      .select("id, first_name, last_name, email, phone, mobile_phone, city, state, zip, country");

    if (filters.geo?.length) query = query.in("zip", filters.geo);

    const { data: customers, error: custErr } = await query.limit(50000);
    if (custErr) throw custErr;

    let filtered = customers || [];

    // Job-based filters
    if (filters.job_type || filters.min_days_since_job || filters.date_range) {
      const ids = filtered.map((c: any) => c.id);
      if (ids.length > 0) {
        let jq = sb.from("jobs").select("customer_id, job_type, scheduled_date").in("customer_id", ids);
        if (filters.job_type) jq = jq.eq("job_type", filters.job_type);
        if (filters.date_range?.from) jq = jq.gte("scheduled_date", filters.date_range.from);
        if (filters.date_range?.to) jq = jq.lte("scheduled_date", filters.date_range.to);
        const { data: jobs } = await jq;
        const jobIds = new Set((jobs || []).map((j: any) => j.customer_id));

        if (filters.min_days_since_job) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - filters.min_days_since_job);
          const recent = new Set(
            (jobs || []).filter((j: any) => j.scheduled_date && new Date(j.scheduled_date) > cutoff).map((j: any) => j.customer_id)
          );
          filtered = filtered.filter((c: any) => jobIds.has(c.id) && !recent.has(c.id));
        } else {
          filtered = filtered.filter((c: any) => jobIds.has(c.id));
        }
      }
    }

    // Agreement filter
    if (filters.has_agreement) {
      const ids = filtered.map((c: any) => c.id);
      if (ids.length > 0) {
        const { data: agreements } = await sb.from("service_agreements").select("customer_id").in("customer_id", ids).eq("status", "active");
        const aIds = new Set((agreements || []).map((a: any) => a.customer_id));
        filtered = filtered.filter((c: any) => aIds.has(c.id));
      }
    }

    // Unconverted estimates
    if (filters.estimate_not_converted) {
      const ids = filtered.map((c: any) => c.id);
      if (ids.length > 0) {
        const { data: estimates } = await sb.from("estimates").select("customer_id").in("customer_id", ids);
        const { data: jobs } = await sb.from("jobs").select("customer_id").in("customer_id", ids);
        const jobIds = new Set((jobs || []).map((j: any) => j.customer_id));
        const estIds = new Set((estimates || []).map((e: any) => e.customer_id));
        filtered = filtered.filter((c: any) => estIds.has(c.id) && !jobIds.has(c.id));
      }
    }

    // Must have email or phone
    filtered = filtered.filter((c: any) => c.email || c.phone || c.mobile_phone);

    // Google Ads Customer Match CSV format
    const header = "Email,Phone,First Name,Last Name,Country,Zip";
    const rows = filtered.map((c: any) => {
      const phone = (c.mobile_phone || c.phone || "").replace(/\D/g, "");
      const formattedPhone = phone ? (phone.startsWith("1") ? `+${phone}` : `+1${phone}`) : "";
      return [
        c.email || "",
        formattedPhone,
        c.first_name || "",
        c.last_name || "",
        "US",
        c.zip || "",
      ].map(v => `"${(v || "").replace(/"/g, '""')}"`).join(",");
    });

    const csv = [header, ...rows].join("\n");

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${audience.name.replace(/[^a-zA-Z0-9]/g, "_")}_google_audience.csv"`,
      },
    });
  } catch (err) {
    console.error("export-audience-csv error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
