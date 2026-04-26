import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



async function getProgress(supabase: any) {
  const { data } = await supabase
    .from("company_settings")
    .select("value")
    .eq("key", "archive_progress")
    .maybeSingle();
  if (data?.value) {
    try { return JSON.parse(data.value); } catch { return null; }
  }
  return null;
}

async function saveProgress(supabase: any, progress: any) {
  const val = JSON.stringify(progress);
  const { data: existing } = await supabase
    .from("company_settings")
    .select("id")
    .eq("key", "archive_progress")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("company_settings")
      .update({ value: val, updated_at: new Date().toISOString() })
      .eq("key", "archive_progress");
  } else {
    await supabase
      .from("company_settings")
      .insert({ key: "archive_progress", value: val });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
            const supabase = getSupabaseAdmin();

    // Handle resume check — just return saved progress
    if (body.resume) {
      const progress = await getProgress(supabase);
      return new Response(JSON.stringify({ progress }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle reset — clear progress
    if (body.reset) {
      await supabase
        .from("company_settings")
        .delete()
        .eq("key", "archive_progress");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle stop — save current stats with stopped status
    if (body.stop) {
      const progress = body.progress;
      if (progress) {
        progress.status = "stopped";
        await saveProgress(supabase, progress);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { page = 1, page_size = 10 } = body;
    const apiKey = Deno.env.get("HCP_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get jobs with hcp_id
    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, hcp_id")
      .not("hcp_id", "is", null)
      .order("created_at", { ascending: true })
      .range((page - 1) * page_size, page * page_size - 1);

    if (jobsErr) throw new Error(jobsErr.message);

    // Count total jobs with hcp_id for progress tracking
    const { count: totalJobs } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .not("hcp_id", "is", null);

    const totalPages = Math.ceil((totalJobs || 0) / page_size);
    let archived = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const job of (jobs || [])) {
      try {
        // Check if already archived
        const { count: existingCount } = await supabase
          .from("job_attachments")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job.id);

        if ((existingCount || 0) > 0) {
          skipped++;
          continue;
        }

        // Fetch attachments from HCP
        const hcpResp = await fetch(
          `https://api.housecallpro.com/jobs/${job.hcp_id}?expand[]=attachments`,
          { headers: { Authorization: `Token ${apiKey}` } }
        );

        if (!hcpResp.ok) {
          if (hcpResp.status === 429) {
            return new Response(JSON.stringify({
              retry: true,
              retry_after: 10,
              page,
              archived,
              skipped,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          errors.push(`Job ${job.hcp_id}: HCP ${hcpResp.status}`);
          continue;
        }

        const hcpJob = await hcpResp.json();
        const attachments = hcpJob.attachments || [];

        if (attachments.length === 0) {
          skipped++;
          continue;
        }

        // Download and store each attachment
        for (const att of attachments) {
          try {
            const url = att.url;
            if (!url) continue;

            const fileResp = await fetch(url);
            if (!fileResp.ok) {
              errors.push(`Job ${job.hcp_id}: download failed for ${att.id}`);
              continue;
            }

            const fileBlob = await fileResp.blob();
            const ext = (att.file_name || "photo.jpg").split(".").pop() || "jpg";
            const storagePath = `${job.id}/${att.id}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from("job-photos")
              .upload(storagePath, fileBlob, {
                contentType: att.file_type || att.content_type || "image/jpeg",
                upsert: true,
              });

            if (uploadErr) {
              errors.push(`Job ${job.hcp_id}: upload failed - ${uploadErr.message}`);
              continue;
            }

            await supabase.from("job_attachments").insert({
              job_id: job.id,
              hcp_attachment_id: att.id,
              file_name: att.file_name || att.filename || "attachment",
              file_path: storagePath,
              file_type: att.file_type || att.content_type || "image/jpeg",
            });

            archived++;
          } catch (attErr: any) {
            errors.push(`Job ${job.hcp_id}: ${attErr.message}`);
          }
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (jobErr: any) {
        errors.push(`Job ${job.hcp_id}: ${jobErr.message}`);
      }
    }

    const done = page >= totalPages || (jobs || []).length < page_size;

    // Save progress after each page
    const cumulative = body.cumulative || { archived: 0, skipped: 0, errors: 0 };
    const progressData = {
      last_completed_page: page,
      total_pages: totalPages,
      total_jobs: totalJobs || 0,
      total_archived: cumulative.archived + archived,
      total_skipped: cumulative.skipped + skipped,
      total_errors: cumulative.errors + (errors.length),
      status: done ? "done" : "running",
      updated_at: new Date().toISOString(),
    };
    await saveProgress(supabase, progressData);

    return new Response(JSON.stringify({
      page,
      total_pages: totalPages,
      total_jobs: totalJobs || 0,
      archived,
      skipped,
      errors: errors.slice(0, 10),
      done,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("archive-hcp-photos error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
