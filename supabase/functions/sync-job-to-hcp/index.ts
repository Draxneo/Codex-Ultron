import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



function fmtTime(t: string): string {
  return t.replace(" ", "T").replace(/\+00$/, "+00:00").replace(/\+00:00:00$/, "+00:00");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id, estimate_id } = await req.json();
    const id = job_id || estimate_id;
    const table = estimate_id ? "estimates" : "jobs";
    if (!id) {
      return new Response(
        JSON.stringify({ error: "job_id or estimate_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseAdmin();

    const HCP_API_KEY = Deno.env.get("HCP_API_KEY");
    if (!HCP_API_KEY) {
      return new Response(
        JSON.stringify({ error: "HCP_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectCols = table === "estimates"
      ? "id, hcp_id, arrival_start, arrival_end, assigned_to, customer_name, estimate_number"
      : "id, hcp_id, arrival_start, arrival_end, assigned_to, customer_name, job_number, hcp_job_number";
    const { data: record, error: fetchErr } = await supabase
      .from(table)
      .select(selectCols)
      .eq("id", id)
      .single();

    if (fetchErr || !record) {
      return new Response(
        JSON.stringify({ error: "Record not found", details: fetchErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!record.hcp_id) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no hcp_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hcpBase = "https://api.housecallpro.com";
    const hcpHeaders = {
      "Authorization": `Token ${HCP_API_KEY}`,
      "Content-Type": "application/json",
    };
    const hcpEntity = table === "estimates" ? "estimates" : "jobs";
    let scheduleSynced = false;
    let dispatchSynced = false;
    const logs: string[] = [];

    // 1. Sync schedule — HCP uses start_time/end_time for PUT schedule
    if (record.arrival_start && record.arrival_end) {
      const startFmt = fmtTime(record.arrival_start);
      const endFmt = fmtTime(record.arrival_end);
      const scheduleBody = { start_time: startFmt, end_time: endFmt };

      const schedRes = await fetch(
        `${hcpBase}/${hcpEntity}/${record.hcp_id}/schedule`,
        { method: "PUT", headers: hcpHeaders, body: JSON.stringify(scheduleBody) }
      );
      if (schedRes.ok) {
        scheduleSynced = true;
        logs.push(`Schedule synced: ${startFmt} → ${endFmt}`);
      } else {
        const errText = await schedRes.text();
        logs.push(`Schedule sync failed (${schedRes.status}): ${errText}`);
        console.error(`HCP schedule sync failed for ${hcpEntity}/${record.hcp_id}:`, errText);
      }
    }

    // 2. Sync dispatch — HCP expects dispatched_employees as array of { id } objects
    if (record.assigned_to) {
      const { data: emp } = await supabase
        .from("employees")
        .select("hcp_employee_id")
        .eq("name", record.assigned_to)
        .single();

      if (emp?.hcp_employee_id) {
        // HCP dispatch expects array of objects — try multiple formats
        const dispatchBody = {
          dispatched_employees: [{ employee_id: emp.hcp_employee_id }],
        };

        const dispRes = await fetch(
          `${hcpBase}/${hcpEntity}/${record.hcp_id}/dispatch`,
          { method: "PUT", headers: hcpHeaders, body: JSON.stringify(dispatchBody) }
        );
        if (dispRes.ok) {
          dispatchSynced = true;
          logs.push(`Dispatch synced: ${record.assigned_to} (${emp.hcp_employee_id})`);
        } else {
          const errText = await dispRes.text();
          logs.push(`Dispatch sync failed (${dispRes.status}): ${errText}`);
          console.error(`HCP dispatch sync failed:`, errText);
        }
      } else {
        logs.push(`No hcp_employee_id found for "${record.assigned_to}"`);
      }
    }

    // 3. Log to activity_log
    if (scheduleSynced || dispatchSynced) {
      await supabase.from("activity_log").insert({
        job_id: table === "jobs" ? id : null,
        action: "hcp_synced",
        details: logs.join("; "),
      });
    }

    console.log(`sync-job-to-hcp [${table}/${id}]:`, logs.join("; "));

    return new Response(
      JSON.stringify({ synced: true, schedule: scheduleSynced, dispatch: dispatchSynced, logs }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-job-to-hcp error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
