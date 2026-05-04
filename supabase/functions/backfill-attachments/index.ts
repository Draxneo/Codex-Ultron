import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { offset = 0, limit = 5 } = await req.json();
    const apiKey = Deno.env.get("HCP_API_KEY");
    if (!apiKey) throw new Error("HCP_API_KEY not configured");

    // Find jobs created after March 5 that have NO attachments in our DB
    const { data: jobs, error: jobErr } = await supabase
      .from("jobs")
      .select("id, hcp_id")
      .not("hcp_id", "is", null)
      .gt("created_at", "2026-03-05T23:59:59Z")
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (jobErr) throw new Error(jobErr.message);
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ done: true, archived: 0, checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out jobs that already have attachments
    const jobIds = jobs.map((j: any) => j.id);
    const { data: existing } = await supabase
      .from("job_attachments")
      .select("job_id")
      .in("job_id", jobIds);
    const hasAttachments = new Set((existing || []).map((a: any) => a.job_id));
    const needsSync = jobs.filter((j: any) => !hasAttachments.has(j.id));

    // Return immediately, process in background
    const nextOffset = offset + limit;
    const response = new Response(JSON.stringify({
      done: jobs.length < limit,
      processing: needsSync.length,
      skipped_existing: hasAttachments.size,
      next_offset: nextOffset,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Background processing
    EdgeRuntime.waitUntil((async () => {
      let archived = 0;
      for (const job of needsSync) {
        try {
          const resp = await fetch(
            `https://api.housecallpro.com/jobs/${job.hcp_id}?expand[]=attachments`,
            { headers: { Authorization: `Token ${apiKey}` } }
          );
          if (!resp.ok) {
            if (resp.status === 429) { console.log("Rate limited, stopping"); break; }
            continue;
          }
          const hcpJob = await resp.json();
          const attachments = hcpJob.attachments || [];
          if (attachments.length === 0) continue;

          for (const att of attachments) {
            if (!att.url) continue;
            try {
              const fileResp = await fetch(att.url);
              if (!fileResp.ok) continue;
              const blob = await fileResp.blob();
              const ext = (att.file_name || "photo.jpg").split(".").pop() || "jpg";
              const path = `${job.id}/${att.id}.${ext}`;

              const { error: upErr } = await supabase.storage
                .from("job-photos")
                .upload(path, blob, {
                  contentType: att.file_type || att.content_type || "image/jpeg",
                  upsert: true,
                });
              if (upErr) continue;

              await supabase.from("job_attachments").upsert({
                job_id: job.id,
                hcp_attachment_id: att.id,
                file_name: att.file_name || att.filename || "attachment",
                file_path: path,
                file_type: att.file_type || att.content_type || "image/jpeg",
              }, { onConflict: "hcp_attachment_id" });
              archived++;
            } catch { /* skip */ }
          }
          await new Promise(r => setTimeout(r, 200));
        } catch (e: any) {
          console.error(`backfill ${job.hcp_id}:`, e.message);
        }
      }
      console.log(`Backfill batch done: archived ${archived} from ${needsSync.length} jobs (offset ${offset})`);
    })());

    return response;
  } catch (err: any) {
    console.error("backfill-attachments error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
