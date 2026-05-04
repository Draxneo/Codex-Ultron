import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const hcpApiKey = Deno.env.get("HCP_API_KEY");
    if (!hcpApiKey) throw new Error("HCP_API_KEY not set");

    const supabase = getSupabaseAdmin();

    // Get jobs missing arrival times that have an hcp_id
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, hcp_id")
      .not("hcp_id", "is", null)
      .is("arrival_start", null)
      .not("scheduled_date", "is", null)
      .limit(200);

    if (error) throw error;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No jobs need backfill", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${jobs.length} jobs missing arrival times`);

    let updated = 0;
    let errors = 0;

    // Fetch each job from HCP and update only arrival times
    for (const job of jobs) {
      try {
        const resp = await fetch(`https://api.housecallpro.com/jobs/${job.hcp_id}`, {
          headers: { Authorization: `Token ${hcpApiKey}` },
        });

        if (!resp.ok) {
          console.log(`HCP ${resp.status} for ${job.hcp_id}`);
          errors++;
          continue;
        }

        const hcpJob = await resp.json();
        const arrivalStart = hcpJob.schedule?.scheduled_start || null;
        const arrivalEnd = hcpJob.schedule?.scheduled_end || null;
        const hcpJobNumber = hcpJob.invoice_number || hcpJob.job_number || hcpJob.number || null;

        const updates: Record<string, any> = {};
        if (arrivalStart) updates.arrival_start = arrivalStart;
        if (arrivalEnd) updates.arrival_end = arrivalEnd;
        // Also fix missing hcp_job_number if we can
        if (hcpJobNumber) {
          updates.hcp_job_number = hcpJobNumber;
        }

        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await supabase
            .from("jobs")
            .update(updates)
            .eq("id", job.id);
          if (upErr) {
            console.log(`Update error for ${job.id}:`, upErr.message);
            errors++;
          } else {
            updated++;
          }
        }

        // Rate limit: 300ms between calls
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        console.log(`Error processing ${job.hcp_id}:`, e.message);
        errors++;
      }
    }

    console.log(`Backfill complete: ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({ ok: true, total: jobs.length, updated, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("backfill-arrival-times error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
