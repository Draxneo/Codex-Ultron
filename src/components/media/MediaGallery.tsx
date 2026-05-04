import { useState } from "react";
import { MediaThumbnail } from "./MediaThumbnail";
import { MediaLightbox, type MediaLightboxItem } from "./MediaLightbox";
import { cn } from "@/lib/utils";

export interface MediaGalleryItem extends MediaLightboxItem {
  id?: string;
  badge?: string;
}

interface MediaGalleryProps {
  items: MediaGalleryItem[];
  /** Tailwind grid-cols utility, default responsive 2→6 */
  gridClassName?: string;
  thumbClassName?: string;
  emptyState?: React.ReactNode;
  /** Optional: enables Annotate button in lightbox; receives flattened PNG blob */
  onAnnotated?: (item: MediaGalleryItem, blob: Blob) => Promise<void> | void;
}

/**
 * Grid of thumbnails wired to a shared MediaLightbox.
 * Drop-in replacement for ad-hoc photo grids.
 */
export function MediaGallery({
  items,
  gridClassName = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2",
  thumbClassName,
  emptyState,
  onAnnotated,
}: MediaGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!items.length) return <>{emptyState}</>;

  return (
    <>
      <div className={cn(gridClassName)}>
        {items.map((item, i) => (
          <MediaThumbnail
            key={item.id ?? `${item.url}-${i}`}
            url={item.url}
            fileName={item.fileName}
            fileType={item.fileType}
            category={item.category}
            badge={item.badge}
            className={thumbClassName}
            onClick={() => setOpenIndex(i)}
          />
        ))}
      </div>

      <MediaLightbox
        items={items}
        index={openIndex ?? 0}
        open={openIndex !== null}
        onOpenChange={(o) => !o && setOpenIndex(null)}
        onIndexChange={setOpenIndex}
        onAnnotated={onAnnotated as any}
      />
    </>
  );
}
