import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const HCP_BASE = "https://api.housecallpro.com";

type HcpAttachmentRow = {
  id: string;
  source_type: "customer" | "job" | "estimate" | string;
  source_id: string | null;
  hcp_source_id: string | null;
  hcp_attachment_id: string | null;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  file_name: string;
  file_type: string | null;
  original_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  archive_status: string;
  retry_count: number;
  raw_hcp_json: Record<string, unknown>;
};

type ArchiveResult = {
  id: string;
  source_type: string;
  hcp_attachment_id: string | null;
  file_name: string;
  status: "archived" | "skipped" | "failed";
  storage_path?: string;
  error?: string;
};

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
    "text/plain": "txt",
  };
  return map[(contentType || "").toLowerCase()] || "bin";
}

function bucketFor(row: HcpAttachmentRow) {
  if (row.source_type === "job") return "job-photos";
  if (row.source_type === "estimate") return "estimate-attachments";
  if (row.source_type === "customer") return "customer-attachments";
  return "customer-attachments";
}

function sourceFolder(row: HcpAttachmentRow) {
  return row.job_id || row.estimate_id || row.customer_id || row.source_id || row.hcp_source_id || "unlinked";
}

function storagePathFor(row: HcpAttachmentRow, contentType: string | null | undefined) {
  const fileName = cleanFileName(row.file_name);
  const ext = extensionFrom(fileName, contentType || row.file_type);
  const baseName = fileName.match(/\.[a-z0-9]{2,8}$/i) ? fileName : `${fileName}.${ext}`;
  const attachmentKey = cleanFileName(row.hcp_attachment_id || row.id);
  return `${row.source_type}/${sourceFolder(row)}/${attachmentKey}-${baseName}`;
}

async function sha256(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readResponseBytes(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > maxBytes) {
    throw new Error(`File exceeds archive limit (${contentLength} bytes > ${maxBytes} bytes)`);
  }

  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) {
      throw new Error(`File exceeds archive limit (${bytes.byteLength} bytes > ${maxBytes} bytes)`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`File exceeds archive limit (${total} bytes > ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function candidateUrlFromRaw(raw: Record<string, unknown>) {
  for (const key of ["url", "file_url", "attachment_url", "image_url", "original_url"]) {
    const value = raw?.[key];
    if (typeof value === "string" && value.startsWith("http")) return value;
  }
  return null;
}

function listNestedAttachments(value: unknown): any[] {
  if (!value || typeof value !== "object") return [];
  const found: any[] = [];

  if (Array.isArray(value)) {
    for (const item of value) found.push(...listNestedAttachments(item));
    return found;
  }

  const obj = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(obj)) {
    if (key.toLowerCase().includes("attachment") && Array.isArray(child)) {
      found.push(...child.filter((item) => item && typeof item === "object"));
    }
    if (child && typeof child === "object") found.push(...listNestedAttachments(child));
  }
  return found;
}

async function fetchHcpObject(sourceType: string, hcpSourceId: string, apiKey: string) {
  const pathBySource: Record<string, string> = {
    customer: `/customers/${hcpSourceId}`,
    job: `/jobs/${hcpSourceId}`,
    estimate: `/estimates/${hcpSourceId}`,
  };
  const path = pathBySource[sourceType];
  if (!path) return null;

  const url = new URL(`${HCP_BASE}${path}`);
  url.searchParams.append("expand[]", "attachments");
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  return await response.json();
}

async function refreshAttachmentUrl(row: HcpAttachmentRow, apiKey: string) {
  if (!row.hcp_source_id || !row.hcp_attachment_id) return null;
  let parentHcpId = row.hcp_source_id;

  // Estimate attachments came from nested estimate options. The normalizer stores
  // the option id as hcp_source_id, so hop back to the parent estimate before
  // asking HCP for fresh signed URLs.
  if (row.source_type === "estimate") {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("hcp_raw_objects")
      .select("parent_source_key")
      .eq("source_type", "estimate_option")
      .eq("source_key", row.hcp_source_id)
      .maybeSingle();
    parentHcpId = data?.parent_source_key || row.hcp_source_id;
  }

  const parent = await fetchHcpObject(row.source_type, parentHcpId, apiKey);
  if (!parent) return null;

  const attachments = listNestedAttachments(parent);
  const match = attachments.find((att) => {
    const id = att?.id || att?.uuid || att?.attachment_id;
    return id === row.hcp_attachment_id;
  });
  return match ? candidateUrlFromRaw(match) : null;
}

async function downloadWithRefresh(row: HcpAttachmentRow, apiKey: string) {
  const firstUrl = row.original_url || candidateUrlFromRaw(row.raw_hcp_json);
  const urls = [firstUrl].filter(Boolean) as string[];

  for (const url of urls) {
    const response = await fetch(url);
    if (response.ok) return { response, url };
  }

  const freshUrl = await refreshAttachmentUrl(row, apiKey);
  if (!freshUrl) throw new Error("No downloadable HCP URL found");

  const response = await fetch(freshUrl);
  if (!response.ok) throw new Error(`Download failed after refresh: ${response.status}`);
  return { response, url: freshUrl };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
    const sourceType = typeof body.source_type === "string" ? body.source_type : null;
    const retryFailed = body.retry_failed === true;
    const dryRun = body.dry_run === true;
    const maxBytes = Math.min(Math.max(Number(body.max_bytes || 45 * 1024 * 1024), 1024), 45 * 1024 * 1024);

    const apiKey = Deno.env.get("HCP_API_KEY") || Deno.env.get("HOUSECALL_PRO_API_KEY");
    if (!apiKey) return jsonResponse({ error: "HCP_API_KEY not configured" }, 500);

    const eligibleStatuses = retryFailed ? ["metadata", "failed"] : ["metadata"];
    let query = supabase
      .from("hcp_attachments")
      .select("*")
      .in("archive_status", eligibleStatuses)
      .is("storage_path", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (sourceType) query = query.eq("source_type", sourceType);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const results: ArchiveResult[] = [];
    let archived = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of (rows || []) as HcpAttachmentRow[]) {
      try {
        if (!row.hcp_attachment_id) {
          skipped++;
          results.push({
            id: row.id,
            source_type: row.source_type,
            hcp_attachment_id: null,
            file_name: row.file_name,
            status: "skipped",
            error: "Missing HCP attachment id",
          });
          continue;
        }

        const { response, url } = await downloadWithRefresh(row, apiKey);
        const contentType = response.headers.get("content-type") || row.file_type || "application/octet-stream";
        const bytes = await readResponseBytes(response, maxBytes);
        const checksum = await sha256(bytes);
        const bucket = bucketFor(row);
        const storagePath = storagePathFor(row, contentType);

        if (!dryRun) {
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(storagePath, bytes, { contentType, upsert: true });
          if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

          const updates = {
            original_url: url,
            storage_bucket: bucket,
            storage_path: storagePath,
            file_type: contentType,
            file_size: bytes.byteLength,
            checksum,
            uploaded_at: new Date().toISOString(),
            archive_status: "archived",
            last_error: null,
          };

          const { error: updateError } = await supabase
            .from("hcp_attachments")
            .update(updates)
            .eq("id", row.id);
          if (updateError) throw new Error(`Metadata update failed: ${updateError.message}`);

          if (row.source_type === "job") {
            const { error: jobAttachmentError } = await supabase
              .from("job_attachments")
              .update({
                file_path: storagePath,
                file_type: contentType,
                original_url: url,
                storage_bucket: bucket,
                checksum,
                file_size: bytes.byteLength,
                archive_status: "archived",
                last_error: null,
              })
              .eq("hcp_attachment_id", row.hcp_attachment_id);
            if (jobAttachmentError) throw new Error(`Job attachment update failed: ${jobAttachmentError.message}`);
          }
        }

        archived++;
        results.push({
          id: row.id,
          source_type: row.source_type,
          hcp_attachment_id: row.hcp_attachment_id,
          file_name: row.file_name,
          status: "archived",
          storage_path: storagePath,
        });
      } catch (err: any) {
        failed++;
        const message = err?.message || "Unknown archive error";
        results.push({
          id: row.id,
          source_type: row.source_type,
          hcp_attachment_id: row.hcp_attachment_id,
          file_name: row.file_name,
          status: "failed",
          error: message,
        });

        if (!dryRun) {
          const status = message.startsWith("File exceeds archive limit")
            ? "too_large"
            : message === "No downloadable HCP URL found" && (row.retry_count || 0) >= 2
            ? "missing"
            : "failed";
          await supabase
            .from("hcp_attachments")
            .update({
              archive_status: status,
              retry_count: (row.retry_count || 0) + 1,
              last_error: message.slice(0, 1000),
            })
            .eq("id", row.id);
        }
      }
    }

    return jsonResponse({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      selected: rows?.length || 0,
      archived,
      failed,
      skipped,
      has_more: (rows?.length || 0) === limit,
      dry_run: dryRun,
      results,
    });
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Attachment archive failed" }, 500);
  }
});
