import { useEffect, useState } from "react";
import { FileText, Play, File, Music, FileSpreadsheet, ImageOff } from "lucide-react";
import { getFileCategory, type FileCategory } from "@/lib/fileTypes";
import { cn } from "@/lib/utils";

export interface MediaThumbnailProps {
  url: string;
  fileName?: string;
  fileType?: string | null;
  /** Override auto-detection */
  category?: FileCategory;
  className?: string;
  onClick?: () => void;
  /** Optional badge text rendered top-left */
  badge?: string;
}

/**
 * Universal thumbnail for any file type.
 * Image / GIF → image preview (with GIF badge)
 * Video → play icon
 * Audio → music icon
 * PDF → FileText icon
 * Spreadsheet → grid icon
 * Other → file icon
 */
export function MediaThumbnail({
  url,
  fileName,
  fileType,
  category: catOverride,
  className,
  onClick,
  badge,
}: MediaThumbnailProps) {
  const cat = catOverride ?? getFileCategory(fileName, fileType);
  const Comp = onClick ? "button" : "div";
  const [imageFailed, setImageFailed] = useState(false);
  const shouldPreviewImage = (cat === "image" || cat === "gif") && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  return (
    <Comp
      onClick={onClick}
      className={cn(
        "aspect-square rounded-lg overflow-hidden border border-border transition-all relative bg-muted/30",
        onClick && "hover:ring-2 hover:ring-primary/30 cursor-pointer",
        className
      )}
    >
      {shouldPreviewImage && (
        <>
          <img
            src={url}
            alt={fileName || "Image"}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
          {cat === "gif" && (
            <span className="absolute top-1 right-1 text-[9px] uppercase tracking-wide bg-background/90 text-foreground rounded px-1 py-0.5 font-bold">
              GIF
            </span>
          )}
        </>
      )}
      {(cat === "image" || cat === "gif") && imageFailed && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
            {fileName || "Image unavailable"}
          </span>
          <span className="text-[9px] text-muted-foreground/80">Open to retry</span>
        </div>
      )}
      {cat === "video" && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
          <Play className="h-8 w-8 text-primary fill-primary/30" />
          <span className="text-[10px] text-muted-foreground truncate max-w-full px-1">
            {fileName || "Video"}
          </span>
        </div>
      )}
      {cat === "audio" && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
          <Music className="h-8 w-8 text-primary" />
          <span className="text-[10px] text-muted-foreground truncate max-w-full px-1">
            {fileName || "Audio"}
          </span>
        </div>
      )}
      {cat === "pdf" && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
          <FileText className="h-8 w-8 text-primary" />
          <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
            {fileName || "PDF"}
          </span>
        </div>
      )}
      {cat === "spreadsheet" && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
            {fileName || "Sheet"}
          </span>
        </div>
      )}
      {(cat === "doc" || cat === "other") && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
          <File className="h-8 w-8 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
            {fileName || "File"}
          </span>
        </div>
      )}

      {badge && (
        <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wide bg-primary/90 text-primary-foreground rounded px-1 py-0.5 font-semibold">
          {badge}
        </span>
      )}
    </Comp>
  );
}
