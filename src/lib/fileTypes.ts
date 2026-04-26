export type FileCategory =
  | "image"
  | "gif"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "spreadsheet"
  | "other";

/**
 * Detect file category from name and/or MIME type.
 * Centralised so every part of the app classifies consistently.
 */
export function getFileCategory(
  fileName: string | null | undefined,
  fileType?: string | null
): FileCategory {
  const name = (fileName || "").toLowerCase();
  const type = (fileType || "").toLowerCase();

  if (type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (type.startsWith("video/") || /\.(mp4|mov|webm|avi|mkv|m4v)$/.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac|flac)$/.test(name)) return "audio";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|heic|heif|bmp|svg|tiff?)$/.test(name)
  )
    return "image";
  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type.includes("csv") ||
    /\.(xlsx?|csv|numbers|ods)$/.test(name)
  )
    return "spreadsheet";
  if (
    type.includes("word") ||
    type.includes("document") ||
    /\.(docx?|pages|odt|rtf|txt)$/.test(name)
  )
    return "doc";

  return "other";
}

/** Animated formats that should get a "GIF" / motion badge */
export function isAnimated(category: FileCategory): boolean {
  return category === "gif";
}

/** Format byte count for display */
export function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * @deprecated Prefer rendering PDFs via PdfPreview (pdf.js canvas).
 * Kept for legacy callers.
 */
export function pdfViewerUrl(publicUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(publicUrl)}&embedded=true`;
}
