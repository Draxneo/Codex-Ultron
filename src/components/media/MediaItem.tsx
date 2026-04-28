import { File, FileText, Play, ExternalLink } from "lucide-react";
import { getFileCategory, formatBytes, type FileCategory } from "@/lib/fileTypes";
import { cn } from "@/lib/utils";
import { PdfPreview } from "./PdfPreview";
import { UniversalMediaPlayer } from "./UniversalMediaPlayer";

export type MediaVariant = "compact" | "card" | "inline";

interface MediaItemProps {
  url: string;
  fileName?: string;
  fileType?: string | null;
  size?: number;
  /** Override auto-detection */
  category?: FileCategory;
  variant?: MediaVariant;
  className?: string;
  onClick?: () => void;
  /** Render PDF inline (canvas) vs link only — defaults true for `card`, false otherwise */
  renderPdfInline?: boolean;
}

/**
 * Universal inline renderer for any single media asset.
 * Handles image / gif / video / audio / pdf / doc / other.
 *
 * Variants:
 *  - compact: thumbnail-sized, used in chat bubbles & lists
 *  - card:    full preview with controls, used in main panels
 *  - inline:  medium size, used in feeds/timelines
 */
export function MediaItem({
  url,
  fileName,
  fileType,
  size,
  category: catOverride,
  variant = "inline",
  className,
  onClick,
  renderPdfInline,
}: MediaItemProps) {
  if (!url) return null;

  const cat = catOverride ?? getFileCategory(fileName, fileType);
  const showPdfInline = renderPdfInline ?? variant === "card";

  const heightClass =
    variant === "compact"
      ? "max-h-20"
      : variant === "card"
      ? "max-h-[70vh]"
      : "max-h-48";

  const radius = variant === "compact" ? "rounded" : "rounded-lg";

  // ---------- IMAGE / GIF ----------
  if (cat === "image" || cat === "gif") {
    const img = (
      <div className="relative inline-block">
        <img
          src={url}
          alt={fileName || "Image"}
          className={cn(heightClass, radius, variant === "card" && "w-full object-contain")}
          loading="lazy"
        />
        {cat === "gif" && (
          <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wide bg-background/90 text-foreground rounded px-1 py-0.5 font-bold pointer-events-none">
            GIF
          </span>
        )}
      </div>
    );
    if (onClick) {
      return (
        <button onClick={onClick} className={cn("block", className)}>
          {img}
        </button>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("block", className)}
      >
        {img}
      </a>
    );
  }

  // ---------- VIDEO ----------
  if (cat === "video") {
    return (
      <UniversalMediaPlayer
        src={url}
        kind="video"
        title={fileName || "Video"}
        variant={variant === "compact" ? "compact" : variant === "card" ? "card" : "inline"}
        className={cn(variant !== "compact" && heightClass, radius, className)}
      />
    );
  }

  // ---------- AUDIO ----------
  if (cat === "audio") {
    return (
      <UniversalMediaPlayer
        src={url}
        kind="audio"
        title={fileName || "Audio"}
        variant={variant === "compact" ? "compact" : variant === "card" ? "card" : "inline"}
        className={className}
      />
    );
  }

  // ---------- PDF ----------
  if (cat === "pdf") {
    if (showPdfInline) {
      return (
        <div className={cn("space-y-2", className)}>
          <PdfPreview url={url} />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" /> Open in new tab
          </a>
        </div>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-primary hover:underline",
          className
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        {fileName || "View PDF"}
        {size ? <span className="text-muted-foreground">({formatBytes(size)})</span> : null}
      </a>
    );
  }

  // ---------- DOC / SPREADSHEET / OTHER ----------
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-primary hover:underline",
        className
      )}
    >
      <File className="h-3.5 w-3.5" />
      {fileName || "Attachment"}
      {size ? <span className="text-muted-foreground">({formatBytes(size)})</span> : null}
    </a>
  );
}

// Suppress unused-import warning for Play icon (kept for future video poster)
void Play;
