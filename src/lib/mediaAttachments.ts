import { getFileCategory, type FileCategory } from "@/lib/fileTypes";

export type RawMediaAttachment =
  | string
  | {
      url?: string | null;
      media_url?: string | null;
      publicUrl?: string | null;
      signedUrl?: string | null;
      content_type?: string | null;
      contentType?: string | null;
      mime_type?: string | null;
      file_type?: string | null;
      fileName?: string | null;
      file_name?: string | null;
      name?: string | null;
      filename?: string | null;
      size?: number | null;
    };

export interface NormalizedMediaAttachment {
  url: string;
  fileName?: string;
  fileType?: string | null;
  size?: number | null;
  category?: FileCategory;
}

function nameFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    const clean = url.split("?")[0];
    const last = clean.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  }
}

function guessContentType(url: string, fileName?: string): string | null {
  const source = `${fileName || ""} ${url.split("?")[0]}`.toLowerCase();
  if (/\.(jpe?g)$/.test(source)) return "image/jpeg";
  if (/\.png$/.test(source)) return "image/png";
  if (/\.gif$/.test(source)) return "image/gif";
  if (/\.webp$/.test(source)) return "image/webp";
  if (/\.heic$/.test(source)) return "image/heic";
  if (/\.pdf$/.test(source)) return "application/pdf";
  if (/\.mp4$/.test(source)) return "video/mp4";
  if (/\.mov$/.test(source)) return "video/quicktime";
  if (/\.m4a$/.test(source)) return "audio/mp4";
  if (/\.mp3$/.test(source)) return "audio/mpeg";
  if (/\.wav$/.test(source)) return "audio/wav";
  if (/\.csv$/.test(source)) return "text/csv";
  if (/\.txt$/.test(source)) return "text/plain";
  return null;
}

export function normalizeMediaAttachments(input: unknown): NormalizedMediaAttachment[] {
  const rawList = Array.isArray(input) ? input : input ? [input] : [];

  return rawList
    .map((item): NormalizedMediaAttachment | null => {
      if (typeof item === "string") {
        if (!item) return null;
        const trimmed = item.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            return normalizeMediaAttachments(JSON.parse(trimmed))[0] ?? null;
          } catch {
            // Fall through and treat it as a plain URL/path.
          }
        }
        const fileName = nameFromUrl(item);
        const fileType = guessContentType(item, fileName);
        return {
          url: item,
          fileName,
          fileType,
          category: getFileCategory(fileName, fileType),
        };
      }

      if (!item || typeof item !== "object") return null;

      const url =
        item.url ||
        item.media_url ||
        item.publicUrl ||
        item.signedUrl ||
        null;
      if (!url) return null;

      const fileName =
        item.fileName ||
        item.file_name ||
        item.filename ||
        item.name ||
        nameFromUrl(url);
      const fileType =
        item.content_type ||
        item.contentType ||
        item.mime_type ||
        item.file_type ||
        guessContentType(url, fileName || undefined);

      return {
        url,
        fileName: fileName || undefined,
        fileType,
        size: item.size ?? null,
        category: getFileCategory(fileName, fileType),
      };
    })
    .filter((item): item is NormalizedMediaAttachment => Boolean(item?.url));
}
