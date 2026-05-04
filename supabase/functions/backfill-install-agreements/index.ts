import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseAdmin();

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const cutoff = twoYearsAgo.toISOString().split("T")[0];

    // Step 1: Detect installs from invoice line items that weren't tagged as install
    const brandPattern = "%(Carrier|Trane|Goodman|Lennox|Rheem|Amana|Daikin|York|Bryant|Ruud|American Standard)%";
    const { data: invoiceInstalls } = await supabase.rpc("detect_installs_from_invoices", {
      p_cutoff_date: cutoff,
    });
    // If RPC doesn't exist, data will be null and we fall through to direct query

    // Fallback: direct query if RPC doesn't exist yet
    let detectedJobIds: string[] = [];
    if (!invoiceInstalls) {
      const { data: items } = await supabase
        .from("customer_invoice_items")
        .select("invoice_id, description, customer_invoices!inner(job_id, jobs!inner(id, job_type, scheduled_date, customer_id))")
        .or("description.ilike.%ton%,description.ilike.%seer%,description.ilike.%carrier%,description.ilike.%trane%,description.ilike.%goodman%,description.ilike.%lennox%,description.ilike.%rheem%,description.ilike.%amana%,description.ilike.%daikin%,description.ilike.%york%,description.ilike.%bryant%");

      if (items?.length) {
        const jobIds = new Set<string>();
        for (const item of items) {
          const inv = (item as any).customer_invoices;
          if (!inv?.jobs) continue;
          const job = inv.jobs;
          if (job.job_type !== "install" && job.scheduled_date >= cutoff) {
            jobIds.add(job.id);
          }
        }
        detectedJobIds = [...jobIds];

        // Update those jobs to install type
        if (detectedJobIds.length > 0) {
          await supabase
            .from("jobs")
            .update({ job_type: "install" })
            .in("id", detectedJobIds);
        }
      }
    } else {
      detectedJobIds = (invoiceInstalls as any[]).map((r: any) => r.job_id);
    }

    // Step 2: Get all install jobs in the 2-year window
    const { data: installJobs } = await supabase
      .from("jobs")
      .select("id, customer_id, scheduled_date")
      .eq("job_type", "install")
      .gte("scheduled_date", cutoff)
      .not("customer_id", "is", null);

    if (!installJobs?.length) {
      return new Response(
        JSON.stringify({ detected_installs: detectedJobIds.length, agreements_created: 0, message: "No install jobs found in 2-year window" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Get existing agreements to avoid duplicates
    const customerIds = [...new Set(installJobs.map((j: any) => j.customer_id))];
    const { data: existingAgreements } = await supabase
      .from("service_agreements")
      .select("customer_id")
      .in("customer_id", customerIds)
      .eq("status", "active");

    const hasAgreement = new Set((existingAgreements || []).map((a: any) => a.customer_id));

    // Step 4: Create agreements for customers without one
    // Group by customer, take latest install date
    const customerInstalls = new Map<string, string>();
    for (const job of installJobs) {
      const existing = customerInstalls.get(job.customer_id);
      if (!existing || job.scheduled_date > existing) {
        customerInstalls.set(job.customer_id, job.scheduled_date);
      }
    }

    const toInsert: any[] = [];
    for (const [customerId, installDate] of customerInstalls) {
      if (hasAgreement.has(customerId)) continue;

      const endDate = new Date(installDate);
      endDate.setFullYear(endDate.getFullYear() + 2);

      // Skip if agreement would already be expired
      if (endDate < new Date()) continue;

      toInsert.push({
        customer_id: customerId,
        plan_name: "Comfort Club",
        plan_type: "maintenance",
        frequency: "biannual",
        price: 0,
        start_date: installDate,
        end_date: endDate.toISOString().split("T")[0],
        status: "active",
        agreement_discount_percent: 15,
        total_visits: 4,
        visits_used: 0,
        plan_source: "install_included",
      });
    }

    let created = 0;
    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from("service_agreements")
        .insert(toInsert)
        .select("id");
      if (error) throw error;
      created = inserted?.length || 0;
    }

    return new Response(
      JSON.stringify({
        detected_installs: detectedJobIds.length,
        total_install_jobs: installJobs.length,
        agreements_created: created,
        already_had_agreement: hasAgreement.size,
        message: `Found ${detectedJobIds.length} new installs from invoices, created ${created} Comfort Club agreements`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
