import { useState } from "react";
import { MediaLightbox, MediaThumbnail } from "@/components/media";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";

interface Props {
  url: string;
  contentType?: string;
  fileName?: string;
  compact?: boolean;
}

export function MmsMediaRenderer({ url, contentType, fileName, compact }: Props) {
  const [open, setOpen] = useState(false);
  const mediaUrl = resolveStorageMediaUrl(url, "mms-media");
  const [item] = normalizeMediaAttachments({
    url: mediaUrl,
    content_type: contentType,
    file_name: fileName,
  });

  if (!item) return null;

  return (
    <>
      <MediaThumbnail
        url={item.url}
        fileName={item.fileName}
        fileType={item.fileType}
        category={item.category}
        onClick={() => setOpen(true)}
        className={compact ? "h-16 w-16" : "h-24 w-24"}
      />
      <MediaLightbox
        items={[item]}
        index={0}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
