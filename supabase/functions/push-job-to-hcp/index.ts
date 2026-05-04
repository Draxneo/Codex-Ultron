/**
 * push-job-to-hcp
 *
 * SYSTEM CONNECTIONS:
 *   - Called from: trigger `trg_push_job_to_hcp_on_local_edit` on the jobs
 *     table (fires when a user updates a protected field on an HCP-linked
 *     job). Also callable directly for retries / manual sync.
 *   - Calls HCP API: PUT /jobs/{hcp_id}/schedule and /dispatch
 *   - Updates jobs.synced_at + jobs.locally_modified_at (clears) on success
 *
 * Why this function exists:
 *   We import jobs FROM HCP (via sync-hcp-jobs every minute) but historically
 *   never pushed local edits BACK to HCP. That meant any reschedule made in
 *   our app got reverted by the next minute-cron sync because HCP still had
 *   the old value. We now stamp `locally_modified_at` on local edits so the
 *   sync skips them for 15 minutes — but the right fix is to push the edit
 *   to HCP immediately so HCP and local agree by the next sync tick.
 *
 * Behavior:
 *   - Reads the job by id
 *   - If no hcp_id → no-op (job is local-only, never came from HCP)
 *   - PUTs /schedule with arrival_start + arrival_end if those changed
 *   - PUTs /dispatch with the assignee's hcp_employee_id if assignee changed
 *   - On success: clear locally_modified_at and bump synced_at
 *   - On failure: leave locally_modified_at set so the 15-min protection
 *     kicks in and gives us a window to retry
 *
 * Failure modes worth caring about:
 *   - HCP API down → leave the local row protected, log to system_error_log
 *   - Job exists in our DB but not in HCP → log + clear hcp_id (orphan)
 *   - Assignee has no hcp_employee_id → push schedule but skip dispatch,
 *     log a warning (user needs to map the employee manually)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HCP_BASE = "https://api.housecallpro.com";

interface PushRequest {
  job_id: string;
  reason?: string; // for logging/audit only
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: PushRequest = await req.json().catch(() => ({} as PushRequest));
    if (!body.job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull current local state
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, hcp_id, scheduled_date, arrival_start, arrival_end, assigned_to, status, customer_name")
      .eq("id", body.job_id)
      .maybeSingle();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "job not found", details: jobErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No HCP linkage → nothing to push, success no-op
    if (!job.hcp_id) {
      return new Response(JSON.stringify({ ok: true, note: "no hcp_id, nothing to push" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hcpApiKey = Deno.env.get("HCP_API_KEY");
    if (!hcpApiKey) {
      await logError(supabase, body.job_id, "HCP_API_KEY missing");
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hcpHeaders = {
      "Authorization": `Token ${hcpApiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    const errors: string[] = [];

    // --- 1. Push schedule (start/end time) ---
    // HCP expects ISO-8601 timestamps. arrival_start and arrival_end are
    // stored as timestamptz so they serialize correctly.
    if (job.arrival_start && job.arrival_end) {
      const schedRes = await fetch(`${HCP_BASE}/jobs/${job.hcp_id}/schedule`, {
        method: "PUT",
        headers: hcpHeaders,
        body: JSON.stringify({
          start_time: job.arrival_start,
          end_time: job.arrival_end,
          arrival_window: 0,
        }),
      });
      if (!schedRes.ok) {
        const text = await schedRes.text().catch(() => "");
        errors.push(`schedule PUT ${schedRes.status}: ${text.slice(0, 300)}`);
      }
    }

    // --- 2. Push dispatch (assignee) ---
    // HCP /dispatch needs the employee's hcp_employee_id. Look it up by name.
    if (job.assigned_to) {
      const { data: emp } = await supabase
        .from("employees")
        .select("hcp_employee_id")
        .eq("name", job.assigned_to)
        .eq("is_active", true)
        .maybeSingle();

      if (emp?.hcp_employee_id) {
        const dispRes = await fetch(`${HCP_BASE}/jobs/${job.hcp_id}/dispatch`, {
          method: "PUT",
          headers: hcpHeaders,
          body: JSON.stringify({
            dispatched_employees: [{ employee_id: emp.hcp_employee_id }],
          }),
        });
        if (!dispRes.ok) {
          const text = await dispRes.text().catch(() => "");
          errors.push(`dispatch PUT ${dispRes.status}: ${text.slice(0, 300)}`);
        }
      } else {
        // Tech exists but isn't mapped to an HCP employee. Push schedule but
        // log so the admin can fix the mapping.
        errors.push(`assignee "${job.assigned_to}" has no hcp_employee_id, dispatch not pushed`);
      }
    }

    if (errors.length > 0) {
      await logError(supabase, body.job_id, errors.join(" | "));
      return new Response(JSON.stringify({ ok: false, errors, hcp_id: job.hcp_id }), {
        status: 207, // multi-status: some pushes may have succeeded
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- 3. Success: bump synced_at, clear locally_modified_at ---
    // synced_at change tells the local stamp_locally_modified_at trigger that
    // this is a sync-style write and skips re-stamping. Clearing
    // locally_modified_at lets the next minute-cron sync proceed normally.
    await supabase
      .from("jobs")
      .update({
        synced_at: new Date().toISOString(),
        locally_modified_at: null,
      })
      .eq("id", body.job_id);

    return new Response(JSON.stringify({
      ok: true,
      hcp_id: job.hcp_id,
      reason: body.reason ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Log a push failure to system_error_log for visibility in Mission Control.
 * Non-blocking — if the log itself fails we don't care; the API caller
 * already knows the push failed via the HTTP status.
 */
async function logError(supabase: any, jobId: string, message: string) {
  try {
    await supabase.from("system_error_log").insert({
      source_type: "edge-function",
      source_name: "push-job-to-hcp",
      severity: "warning",
      error_message: message,
      context: { job_id: jobId },
    });
  } catch {
    // best effort
  }
}
