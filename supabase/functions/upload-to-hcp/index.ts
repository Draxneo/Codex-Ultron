import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { withRetry, isRetryable, logSystemError, enqueueRetry } from "../_shared/resilience.ts";

/**
 * Upload attachments from Supabase storage to Housecall Pro.
 * Accepts: { job_id, files: [{ file_path, bucket, file_name? }] }
 * Or single: { job_id, file_path, bucket, file_name? }
 *
 * Hardened (Session 3):
 *   • Each HCP POST is wrapped in fetchWithRetry-style backoff (3 attempts).
 *   • On final failure the file is enqueued to public.retry_queue so the
 *     retry-queue-processor cron can replay it later. The caller still
 *     receives a per-file result with success=false so UI can react.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) throw new Error("job_id required");

    const apiKey = Deno.env.get("HCP_API_KEY");
    if (!apiKey) throw new Error("HCP_API_KEY not configured");

    // Look up job's hcp_id
    const { data: job } = await supabase
      .from("jobs")
      .select("hcp_id")
      .eq("id", jobId)
      .maybeSingle();

    if (!job?.hcp_id) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_hcp_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize to array
    const files: { file_path: string; bucket: string; file_name?: string }[] =
      body.files ? body.files : [{ file_path: body.file_path, bucket: body.bucket, file_name: body.file_name }];

    const results: { file_path: string; success: boolean; error?: string; queued?: boolean }[] = [];

    for (const file of files) {
      try {
        // Download from Supabase storage (transient errors here are rare; not worth retrying)
        const { data: blob, error: dlErr } = await supabase.storage
          .from(file.bucket)
          .download(file.file_path);
        if (dlErr || !blob) {
          results.push({ file_path: file.file_path, success: false, error: dlErr?.message || "download failed" });
          continue;
        }

        const fileName = file.file_name || file.file_path.split("/").pop() || "attachment.jpg";

        // POST to HCP with exponential-backoff retry
        let hcpResp: Response;
        try {
          hcpResp = await withRetry(
            async () => {
              const formData = new FormData();
              formData.append("file", new Blob([blob], { type: "image/jpeg" }), fileName);
              const r = await fetch(
                `https://api.housecallpro.com/jobs/${job.hcp_id}/attachments`,
                { method: "POST", headers: { Authorization: `Token ${apiKey}` }, body: formData }
              );
              if (!r.ok && isRetryable(null, r.status)) {
                const t = await r.text().catch(() => "");
                const err = new Error(`HCP ${r.status}: ${t.slice(0, 200)}`);
                (err as any).status = r.status;
                throw err;
              }
              return r;
            },
            { maxAttempts: 3 }
          );
        } catch (transientErr: any) {
          // All retries failed — persist to retry_queue for the cron processor
          await logSystemError(supabase, {
            source_name: "upload-to-hcp",
            error_message: `HCP unreachable after retries: ${transientErr.message}`,
            severity: "error",
            context: { job_id: jobId, hcp_id: job.hcp_id, file_path: file.file_path },
          });
          await enqueueRetry(supabase, {
            operation_type: "upload_to_hcp",
            source_function: "upload-to-hcp",
            related_id: jobId,
            payload: { job_id: jobId, files: [file] },
          });
          results.push({ file_path: file.file_path, success: false, error: transientErr.message, queued: true });
          continue;
        }

        if (!hcpResp.ok) {
          // Non-retryable HCP error (4xx) — record & move on (not transient)
          const errText = await hcpResp.text();
          await logSystemError(supabase, {
            source_name: "upload-to-hcp",
            error_message: `HCP rejected attachment: ${hcpResp.status}`,
            severity: "warning",
            http_status: hcpResp.status,
            context: { job_id: jobId, file_path: file.file_path, body: errText.slice(0, 300) },
          });
          results.push({ file_path: file.file_path, success: false, error: `HCP ${hcpResp.status}: ${errText}` });
          continue;
        }

        // Mark as synced in job_attachments if a matching row exists
        await supabase
          .from("job_attachments")
          .update({ synced_to_hcp: true } as any)
          .eq("job_id", jobId)
          .eq("file_path", file.file_path);

        results.push({ file_path: file.file_path, success: true });
      } catch (e: any) {
        results.push({ file_path: file.file_path, success: false, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({
        uploaded: results.filter((r) => r.success).length,
        queued: results.filter((r) => r.queued).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("upload-to-hcp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
