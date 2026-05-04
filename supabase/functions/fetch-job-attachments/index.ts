import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HCP_BASE = "https://api.housecallpro.com";
const JOB_PHOTOS_BUCKET = "job-photos";
const MAX_ATTACHMENT_BYTES = 45 * 1024 * 1024;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanFileName(value: string | null | undefined) {
  const name = (value || "attachment").split(/[\\/]/).pop() || "attachment";
  return name.replace(/[^\w.\- ()]+/g, "_").slice(0, 180);
}

function extensionFrom(fileName: string, contentType: string | null | undefined) {
  const fromName = fileName.match(/\.([a-z0-9]{2,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();

  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  return map[(contentType || "").toLowerCase()] || "bin";
}

async function sha256(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readResponseBytes(response: Response, maxBytes = MAX_ATTACHMENT_BYTES) {
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > maxBytes) {
    throw new Error(`File exceeds archive limit (${contentLength} bytes > ${maxBytes} bytes)`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) {
    throw new Error(`File exceeds archive limit (${bytes.byteLength} bytes > ${maxBytes} bytes)`);
  }
  return bytes;
}

function mapJobAttachment(row: any, supabase: any) {
  const path = row.file_path || row.path || "";
  const url = /^https?:\/\//i.test(path)
    ? path
    : supabase.storage.from(JOB_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

  return {
    id: row.id,
    hcp_attachment_id: row.hcp_attachment_id || null,
    file_name: row.file_name || "attachment",
    file_path: row.file_path || row.path || null,
    path: row.file_path || row.path || null,
    url,
    file_type: row.file_type || "image/jpeg",
    created_at: row.created_at || null,
    hidden_from_tech_share: row.hidden_from_tech_share || false,
    archive_status: row.archive_status || "archived",
  };
}

async function resolveLocalJob(supabase: any, hcpId: string, explicitJobId: string | null) {
  if (explicitJobId && UUID_RE.test(explicitJobId)) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id,hcp_id")
      .eq("id", explicitJobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
  }

  if (UUID_RE.test(hcpId)) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id,hcp_id")
      .eq("id", hcpId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("id,hcp_id")
    .eq("hcp_id", hcpId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function listLocalAttachments(supabase: any, jobId: string) {
  const { data, error } = await supabase
    .from("job_attachments")
    .select("id,file_name,file_path,file_type,created_at,hcp_attachment_id,hidden_from_tech_share,archive_status")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => mapJobAttachment(row, supabase));
}

async function archiveHcpAttachment(supabase: any, jobId: string, attachment: any) {
  const hcpAttachmentId = attachment.id || attachment.uuid || attachment.attachment_id;
  const sourceUrl = attachment.url || attachment.file_url || attachment.attachment_url || attachment.image_url;
  if (!hcpAttachmentId || !sourceUrl) return { archived: false, skipped: true };

  const { data: existing } = await supabase
    .from("job_attachments")
    .select("id,file_path,archive_status")
    .eq("job_id", jobId)
    .eq("hcp_attachment_id", hcpAttachmentId)
    .maybeSingle();

  if (existing?.file_path && !/^https?:\/\//i.test(existing.file_path)) {
    return { archived: false, skipped: true };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`HCP attachment download failed: ${response.status}`);

  const contentType = response.headers.get("content-type") || attachment.file_type || attachment.content_type || "application/octet-stream";
  const bytes = await readResponseBytes(response);
  const checksum = await sha256(bytes);
  const fileName = cleanFileName(attachment.file_name || attachment.filename || "attachment");
  const ext = extensionFrom(fileName, contentType);
  const storagePath = `${jobId}/${cleanFileName(hcpAttachmentId)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(JOB_PHOTOS_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { error: upsertError } = await supabase
    .from("job_attachments")
    .upsert({
      job_id: jobId,
      hcp_attachment_id: hcpAttachmentId,
      file_name: fileName,
      file_path: storagePath,
      file_type: contentType,
      original_url: sourceUrl,
      storage_bucket: JOB_PHOTOS_BUCKET,
      checksum,
      file_size: bytes.byteLength,
      archive_status: "archived",
      last_error: null,
    }, { onConflict: "hcp_attachment_id" });
  if (upsertError) throw new Error(`Attachment row update failed: ${upsertError.message}`);

  return { archived: true, skipped: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const requestedHcpId: string | null = body.hcp_id || null;
    const requestedJobId: string | null = body.job_id || null;

    if (!requestedHcpId && !requestedJobId) {
      return jsonResponse({ error: "hcp_id or job_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const localJob = await resolveLocalJob(supabase, requestedHcpId || requestedJobId!, requestedJobId);
    if (!localJob?.id) return jsonResponse({ attachments: [], archived: 0, skipped: 0, errors: [] });

    const hcpId = localJob.hcp_id || (requestedHcpId && !UUID_RE.test(requestedHcpId) ? requestedHcpId : null);
    if (!hcpId) {
      return jsonResponse({
        attachments: await listLocalAttachments(supabase, localJob.id),
        archived: 0,
        skipped: 0,
        errors: [],
      });
    }

    const apiKey = Deno.env.get("HCP_API_KEY") || Deno.env.get("HOUSECALL_PRO_API_KEY");
    if (!apiKey) return jsonResponse({ error: "HCP_API_KEY not configured" }, 500);

    const url = new URL(`${HCP_BASE}/jobs/${hcpId}`);
    url.searchParams.append("expand[]", "attachments");
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        return jsonResponse({
          attachments: await listLocalAttachments(supabase, localJob.id),
          archived: 0,
          skipped: 0,
          errors: [],
        });
      }
      return jsonResponse({ error: `HCP API returned ${resp.status}` }, resp.status);
    }

    const hcpJob = await resp.json();
    const attachments = hcpJob.attachments || [];
    let archived = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const attachment of attachments) {
      try {
        const result = await archiveHcpAttachment(supabase, localJob.id, attachment);
        if (result.archived) archived++;
        if (result.skipped) skipped++;
      } catch (error: any) {
        const hcpAttachmentId = attachment?.id || attachment?.uuid || attachment?.attachment_id;
        errors.push(`${hcpAttachmentId || "attachment"}: ${error?.message || "archive failed"}`);

        if (hcpAttachmentId) {
          await supabase
            .from("job_attachments")
            .upsert({
              job_id: localJob.id,
              hcp_attachment_id: hcpAttachmentId,
              file_name: cleanFileName(attachment.file_name || attachment.filename || "attachment"),
              file_path: attachment.url || "",
              file_type: attachment.file_type || attachment.content_type || "image/jpeg",
              original_url: attachment.url || null,
              archive_status: "failed",
              last_error: (error?.message || "archive failed").slice(0, 1000),
            }, { onConflict: "hcp_attachment_id" });
        }
      }
    }

    return jsonResponse({
      attachments: await listLocalAttachments(supabase, localJob.id),
      archived,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    console.error("fetch-job-attachments error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
