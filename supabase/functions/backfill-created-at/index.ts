import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchPage(hcpApiKey: string, endpoint: string, page: number, direction = "asc") {
  const url = `https://api.housecallpro.com/${endpoint}?page=${page}&page_size=200&sort_direction=${direction}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${hcpApiKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HCP ${endpoint} page ${page}: ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
            const hcpApiKey = Deno.env.get("HCP_API_KEY");
    if (!hcpApiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not set" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    let body: any = {};
    try { body = await req.json(); } catch { /* */ }
    
    const phase = body.phase || "all";
    const direction = body.direction || "asc"; // asc = oldest first

    let jobsUpdated = 0, jobsTotal = 0;
    let estimatesUpdated = 0, estimatesTotal = 0;

    if (phase === "jobs" || phase === "all") {
      for (let page = 1; page <= 50; page++) {
        const data = await fetchPage(hcpApiKey, "jobs", page, direction);
        const jobs = data.jobs || [];
        jobsTotal += jobs.length;
        for (const job of jobs) {
          if (!job.id || !job.created_at) continue;
          const { error } = await supabase
            .from("jobs")
            .update({ created_at: job.created_at })
            .eq("hcp_id", job.id);
          if (!error) jobsUpdated++;
        }
        console.log(`Jobs page ${page}: ${jobs.length} records, ${jobsUpdated} updated so far`);
        if (jobs.length < 200 || page >= (data.total_pages || 1)) break;
        await delay(150);
      }
    }

    if (phase === "estimates" || phase === "all") {
      for (let page = 1; page <= 50; page++) {
        const data = await fetchPage(hcpApiKey, "estimates", page, direction);
        const estimates = data.estimates || [];
        estimatesTotal += estimates.length;
        for (const est of estimates) {
          if (!est.id || !est.created_at) continue;
          const { error } = await supabase
            .from("estimates")
            .update({ created_at: est.created_at })
            .eq("hcp_id", est.id);
          if (!error) estimatesUpdated++;
        }
        console.log(`Estimates page ${page}: ${estimates.length} records, ${estimatesUpdated} updated so far`);
        if (estimates.length < 200 || page >= (data.total_pages || 1)) break;
        await delay(150);
      }
    }

    return new Response(JSON.stringify({
      phase, direction,
      jobs: { total_from_hcp: jobsTotal, updated: jobsUpdated },
      estimates: { total_from_hcp: estimatesTotal, updated: estimatesUpdated },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Backfill error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
