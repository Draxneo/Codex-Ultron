import { supabase } from "@/integrations/supabase/client";

const ABSOLUTE_URL_RE = /^(https?:|blob:|data:)/i;

export function isAbsoluteMediaUrl(value: string | null | undefined): value is string {
  return !!value && ABSOLUTE_URL_RE.test(value.trim());
}

function stripPublicStoragePrefix(value: string, bucket: string): string {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(value.slice(idx + marker.length));

  const clean = value.replace(/^\/+/, "");
  if (clean.startsWith(`${bucket}/`)) return clean.slice(bucket.length + 1);
  return clean;
}

/**
 * Returns a browser-usable URL for media rows that may store either:
 * - a full URL
 * - a raw Supabase storage path
 * - a public storage URL accidentally saved as file_path
 * - a bucket-prefixed path like "job-photos/job-id/file.jpg"
 */
export function resolveStorageMediaUrl(
  filePath: string | null | undefined,
  bucket: string,
): string {
  const value = (filePath || "").trim();
  if (!value) return "";
  if (isAbsoluteMediaUrl(value)) return value;

  const storagePath = stripPublicStoragePrefix(value, bucket);
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}
