import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



async function fetchHcp(url: string, hcpApiKey: string): Promise<{ data: any; retry?: boolean; retry_after?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(url, {
      headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" },
      signal: controller.signal,
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "10", 10);
      await res.text();
      return { data: null, retry: true, retry_after: retryAfter };
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HCP API error: ${res.status} — ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    return { data };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("HCP API request timed out after 25 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const hcpApiKey = Deno.env.get("HCP_API_KEY");

    if (!hcpApiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const page = body.page || 1;
    const pageSize = body.page_size || 50;
    const testMode = body.test === true;

    // Page through HCP invoices with status=paid, sorted by paid_at
    // Filter with paid_at_min to exclude invoices with null paid_at, and use desc to get most recent first
    const url = `https://api.housecallpro.com/invoices?page=${page}&page_size=${pageSize}&status[]=paid&paid_at_min=2020-01-01T00:00:00Z&sort_by=paid_at&sort_direction=desc`;
    
    console.log(`Fetching HCP invoices page ${page}, page_size ${pageSize}`);
    const fetchResult = await fetchHcp(url, hcpApiKey);

    if (fetchResult.retry) {
      return new Response(JSON.stringify({
        page,
        retry: true,
        retry_after: fetchResult.retry_after || 10,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const hcpInvoices = fetchResult.data?.invoices || [];
    const totalPages = fetchResult.data?.total_pages || 0;
    const totalItems = fetchResult.data?.total_items || 0;

    console.log(`Got ${hcpInvoices.length} HCP invoices (page ${page}/${totalPages}, total: ${totalItems})`);

    // Log first invoice for debugging
    if (hcpInvoices.length > 0 && page === 1) {
      const sample = hcpInvoices[0];
      console.log(`Sample HCP invoice: id=${sample.id}, job_id=${sample.job_id}, paid_at=${sample.paid_at}, invoice_number=${sample.invoice_number}`);
    }

    let updated = 0;
    let skipped = 0;
    let noMatch = 0;
    let clamped = 0;

    for (const hcpInv of hcpInvoices) {
      if (!hcpInv.job_id || !hcpInv.paid_at) {
        skipped++;
        continue;
      }

      // Find our job by hcp_id (include scheduled_date for the 3-day rule)
      const { data: job } = await supabase
        .from("jobs")
        .select("id, scheduled_date")
        .eq("hcp_id", hcpInv.job_id)
        .single();

      if (!job) {
        noMatch++;
        continue;
      }

      // Apply 3-day rule: if HCP paid_at is more than 3 days from scheduled_date, use scheduled_date instead
      let finalPaidAt = hcpInv.paid_at;
      if (job.scheduled_date) {
        const schedMs = new Date(job.scheduled_date).getTime();
        const paidMs = new Date(hcpInv.paid_at).getTime();
        const daysDiff = Math.abs(paidMs - schedMs) / (1000 * 60 * 60 * 24);
        if (daysDiff > 3) {
          finalPaidAt = job.scheduled_date;
          clamped++;
        }
      }
      // If no scheduled_date, still use HCP paid_at (best we have)

      // Update the customer_invoice for this job
      const { error: updateErr } = await supabase
        .from("customer_invoices")
        .update({ paid_at: finalPaidAt })
        .eq("job_id", job.id)
        .like("hcp_invoice_id", "hcp-%");

      if (updateErr) {
        console.error(`Failed to update invoice for job ${job.id}: ${updateErr.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    const done = testMode || page >= totalPages || hcpInvoices.length < pageSize;

    return new Response(JSON.stringify({
      page,
      total_pages: totalPages,
      total_items: totalItems,
      invoices_on_page: hcpInvoices.length,
      updated,
      skipped,
      no_match: noMatch,
      clamped,
      done,
      ...(testMode ? { test: true } : {}),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("backfill-paid-dates error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
