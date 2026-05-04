import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type MediaItem = {
  url: string;
  content_type?: string | null;
  contentType?: string | null;
  file_name?: string | null;
  fileName?: string | null;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseMediaItem(raw: unknown): MediaItem | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) return null;
    if (value.startsWith("{") && value.endsWith("}")) {
      try {
        return parseMediaItem(JSON.parse(value));
      } catch {
        return { url: value };
      }
    }
    return { url: value };
  }
  if (typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const url = String(item.url || item.media_url || item.publicUrl || item.signedUrl || "");
  if (!url) return null;
  return {
    url,
    content_type: typeof item.content_type === "string" ? item.content_type : null,
    contentType: typeof item.contentType === "string" ? item.contentType : null,
    file_name: typeof item.file_name === "string" ? item.file_name : null,
    fileName: typeof item.fileName === "string" ? item.fileName : null,
  };
}

function normalizeMediaList(raw: unknown): MediaItem[] {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items.map(parseMediaItem).filter((item): item is MediaItem => !!item?.url);
}

function contentTypeFor(item: MediaItem) {
  return item.content_type || item.contentType || "application/octet-stream";
}

function extensionFor(contentType: string, url: string) {
  const byType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "application/pdf": ".pdf",
  };
  if (byType[contentType]) return byType[contentType];
  try {
    const ext = new URL(url).pathname.match(/\.[a-z0-9]{2,6}$/i)?.[0];
    return ext || ".bin";
  } catch {
    return ".bin";
  }
}

async function downloadTwilioMedia(url: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  if (!accountSid || !authToken) throw new Error("Twilio credentials are not configured");

  const authHeader = "Basic " + btoa(`${accountSid}:${authToken}`);
  const initialResp = await fetch(url, {
    headers: { Authorization: authHeader },
    redirect: "manual",
  });

  let mediaResp: Response;
  if (initialResp.status >= 300 && initialResp.status < 400) {
    const cdnUrl = initialResp.headers.get("location");
    if (!cdnUrl) throw new Error("Twilio media redirect did not include a Location header");
    mediaResp = await fetch(cdnUrl);
  } else {
    mediaResp = initialResp;
  }

  if (!mediaResp.ok) throw new Error(`Twilio media download failed: ${mediaResp.status}`);
  return mediaResp.arrayBuffer();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
    const smsLogId = body.sms_log_id ? String(body.sms_log_id) : null;
    const dryRun = body.dry_run === true;
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("sms_log")
      .select("id, twilio_sid, media_urls")
      .not("media_urls", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (smsLogId) query = query.eq("id", smsLogId);

    const { data: rows, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows || []) {
      const media = normalizeMediaList(row.media_urls);
      let changed = false;
      const nextMedia: MediaItem[] = [];

      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        if (!item.url.includes("api.twilio.com")) {
          nextMedia.push(item);
          continue;
        }

        try {
          if (dryRun) {
            changed = true;
            nextMedia.push(item);
            continue;
          }

          const contentType = contentTypeFor(item);
          const bytes = await downloadTwilioMedia(item.url);
          const ext = extensionFor(contentType, item.url);
          const path = `${row.twilio_sid || row.id}/${i}${ext}`;
          const { error: uploadError } = await supabase.storage.from("mms-media").upload(path, bytes, {
            contentType,
            upsert: true,
          });
          if (uploadError) throw uploadError;

          const { data: publicUrl } = supabase.storage.from("mms-media").getPublicUrl(path);
          nextMedia.push({
            ...item,
            url: publicUrl.publicUrl,
            content_type: contentType,
          });
          changed = true;
        } catch (err: any) {
          failed++;
          nextMedia.push(item);
          results.push({ id: row.id, status: "failed", error: err?.message || "Unknown media archive error" });
        }
      }

      if (!changed) {
        skipped++;
        results.push({ id: row.id, status: "skipped" });
        continue;
      }

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("sms_log")
          .update({ media_urls: nextMedia })
          .eq("id", row.id);
        if (updateError) throw updateError;
      }
      updated++;
      results.push({ id: row.id, status: dryRun ? "would_update" : "updated" });
    }

    return jsonResponse({
      selected: rows?.length || 0,
      updated,
      skipped,
      failed,
      dry_run: dryRun,
      results,
    });
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "archive-sms-media failed" }, 500);
  }
});
