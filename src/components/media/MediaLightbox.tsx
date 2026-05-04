import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Pencil, X, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getFileCategory, type FileCategory } from "@/lib/fileTypes";
import { PdfPreview } from "./PdfPreview";
import { MediaAnnotator } from "./MediaAnnotator";
import { UniversalMediaPlayer } from "./UniversalMediaPlayer";
import { cn } from "@/lib/utils";

export interface MediaLightboxItem {
  url: string;
  fileName?: string;
  fileType?: string | null;
  category?: FileCategory;
  caption?: string;
}

interface MediaLightboxProps {
  items: MediaLightboxItem[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange?: (index: number) => void;
  /**
   * Optional: when provided, an "Annotate" button appears for image items.
   * Receives the flattened PNG blob; caller is responsible for upload + DB insert.
   */
  onAnnotated?: (item: MediaLightboxItem, blob: Blob) => Promise<void> | void;
}

/**
 * Full-screen viewer with prev/next navigation, image zoom, video,
 * pdf canvas, audio, download, open-in-tab, and optional annotation mode.
 */
export function MediaLightbox({
  items,
  index,
  open,
  onOpenChange,
  onIndexChange,
  onAnnotated,
}: MediaLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [annotating, setAnnotating] = useState(false);

  const safeIndex = Math.max(0, Math.min(index, items.length - 1));
  const current = items[safeIndex];

  const goPrev = useCallback(() => {
    if (items.length <= 1 || annotating) return;
    onIndexChange?.((safeIndex - 1 + items.length) % items.length);
    setZoom(1);
  }, [items.length, safeIndex, onIndexChange, annotating]);

  const goNext = useCallback(() => {
    if (items.length <= 1 || annotating) return;
    onIndexChange?.((safeIndex + 1) % items.length);
    setZoom(1);
  }, [items.length, safeIndex, onIndexChange, annotating]);

  // Reset zoom + exit annotation when item changes
  useEffect(() => {
    setZoom(1);
    setAnnotating(false);
  }, [safeIndex]);

  // Reset annotation when closed
  useEffect(() => {
    if (!open) setAnnotating(false);
  }, [open]);

  // Keyboard nav (disabled during annotation)
  useEffect(() => {
    if (!open || annotating) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goPrev, goNext, annotating]);

  if (!current) return null;

  const cat = current.category ?? getFileCategory(current.fileName, current.fileType);
  const isImage = cat === "image" || cat === "gif";
  const canAnnotate = isImage && !!onAnnotated;

  const handleAnnotateSave = async (blob: Blob) => {
    if (!onAnnotated) return;
    await onAnnotated(current, blob);
    setAnnotating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95dvh] w-[95vw] h-[95dvh] p-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{current.fileName || "Media viewer"}</DialogTitle>

        {annotating ? (
          <MediaAnnotator
            imageUrl={current.url}
            fileName={current.fileName}
            onSave={handleAnnotateSave}
            onCancel={() => setAnnotating(false)}
          />
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/95 backdrop-blur z-10">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {current.fileName || "Untitled"}
                </p>
                {items.length > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    {safeIndex + 1} of {items.length}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isImage && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                      disabled={zoom <= 0.25}
                      className="h-8 w-8"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                      disabled={zoom >= 5}
                      className="h-8 w-8"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <span className="mx-1 h-5 w-px bg-border" />
                  </>
                )}
                {canAnnotate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAnnotating(true)}
                    className="h-8"
                    title="Annotate"
                  >
                    <Pencil className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Annotate</span>
                  </Button>
                )}
                <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                  <a href={current.url} target="_blank" rel="noopener noreferrer" title="Open in new tab">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                  <a href={current.url} download={current.fileName} title="Download">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Body */}
            <div className="relative flex-1 min-h-0 bg-black/80 flex items-center justify-center overflow-auto">
              {items.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-background/70 hover:bg-background"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-background/70 hover:bg-background"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {isImage && (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                  <img
                    src={current.url}
                    alt={current.fileName || "Image"}
                    style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                    className="max-w-full max-h-full object-contain transition-transform"
                  />
                </div>
              )}

              {cat === "video" && (
                <UniversalMediaPlayer
                  src={current.url}
                  kind="video"
                  autoPlay
                  title={current.fileName || "Video"}
                  variant="card"
                  className="max-w-4xl w-full mx-4"
                />
              )}

              {cat === "audio" && (
                <UniversalMediaPlayer
                  src={current.url}
                  kind="audio"
                  autoPlay
                  title={current.fileName || "Audio"}
                  variant="card"
                  className="max-w-md w-full mx-4"
                />
              )}

              {cat === "pdf" && (
                <div className="w-full h-full bg-background overflow-auto">
                  <PdfPreview url={current.url} maxHeight="calc(95vh - 60px)" />
                </div>
              )}

              {(cat === "doc" || cat === "spreadsheet" || cat === "other") && (
                <div className="bg-background rounded-lg p-8 text-center max-w-sm mx-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Preview not available for this file type.
                  </p>
                  <Button asChild>
                    <a href={current.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1.5" />
                      Open {current.fileName || "file"}
                    </a>
                  </Button>
                </div>
              )}
            </div>

            {current.caption && (
              <div className={cn("px-3 py-2 border-t text-xs text-muted-foreground bg-background/95")}>
                {current.caption}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
