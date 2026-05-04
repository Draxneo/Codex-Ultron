import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCustomerPhotos } from "@/hooks/useCustomerHistory";
import { ImageIcon } from "lucide-react";
import { MediaThumbnail } from "@/components/media";

interface Props {
  customerId: string;
}

export function AttachmentsCard({ customerId }: Props) {
  const { data: photos = [] } = useCustomerPhotos(customerId);
  const recent = photos.slice(0, 6);

  return (
    <Card className="p-4 shadow-none border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Attachments</h3>
        <span className="text-xs text-muted-foreground">{photos.length}</span>
      </div>
      {recent.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {recent.map((p: any) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
              <MediaThumbnail
                url={p.url}
                fileName={p.file_name}
                fileType={p.file_type}
                badge={p.source_type === "estimate" ? "Est" : p.source_type === "customer" ? "Cust" : undefined}
              />
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-40" />
          <p className="text-xs">No attachments</p>
        </div>
      )}
      <Button size="sm" variant="outline" className="w-full mt-3" disabled title="Not wired yet">
        Attachment upload pending
      </Button>
    </Card>
  );
}
