// Backward-compat shim. Prefer `MediaItem` from `@/components/media`.
import { MediaItem } from "@/components/media/MediaItem";

interface Props {
  url: string;
  contentType?: string;
  compact?: boolean;
}

export function MmsMediaRenderer({ url, contentType, compact }: Props) {
  return (
    <MediaItem
      url={url}
      fileType={contentType}
      variant={compact ? "compact" : "inline"}
    />
  );
}
