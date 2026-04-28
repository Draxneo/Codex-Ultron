import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  currentUrl: string | null;
  bucket: string;
  folder: string;
  onUploaded: (url: string | null) => void;
  className?: string;
  size?: "sm" | "md";
}

export function CatalogImageUpload({ currentUrl, bucket, folder, onUploaded, className, size = "md" }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const dimensions = size === "sm" ? "h-20 w-20" : "h-32 w-full";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      onUploaded(publicUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to upload image";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    onUploaded(null);
  };

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {currentUrl ? (
        <div className={`relative ${dimensions} rounded-lg overflow-hidden border border-border group`}>
          <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:text-white" onClick={() => inputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:text-destructive" onClick={handleRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${dimensions} rounded-lg border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-1 text-muted-foreground/50 hover:text-muted-foreground hover:border-primary/40 transition-colors`}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">Add photo</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
