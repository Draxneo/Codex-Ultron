// Backward-compat shim. Prefer `MediaItem` from `@/components/media`.
import { forwardRef } from "react";
import { MediaItem } from "@/components/media/MediaItem";
import type { FileCategory } from "@/lib/fileTypes";

interface MediaViewerProps {
  url: string;
  fileName?: string;
  fileType?: string | null;
  category?: FileCategory;
  maxHeightClass?: string;
}

export const MediaViewer = forwardRef<HTMLDivElement, MediaViewerProps>(
  ({ url, fileName, fileType, category }, ref) => {
    return (
      <div ref={ref}>
        <MediaItem
          url={url}
          fileName={fileName}
          fileType={fileType}
          category={category}
          variant="card"
        />
      </div>
    );
  }
);

MediaViewer.displayName = "MediaViewer";
