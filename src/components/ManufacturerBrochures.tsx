import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Upload, Trash2, FileText, ExternalLink, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { MediaViewer } from "@/components/ui/media-viewer";

interface Brochure {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  file_path: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export function ManufacturerBrochures() {
  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchBrochures = async () => {
    const { data } = await supabase
      .from("manufacturer_brochures")
      .select("*")
      .order("sort_order");
    setBrochures((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchBrochures(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        toast.error(`${file.name} is not a PDF`);
        continue;
      }

      const path = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadErr } = await supabase.storage
        .from("manufacturer-brochures")
        .upload(path, file);

      if (uploadErr) {
        toast.error(`Upload failed: ${uploadErr.message}`);
        continue;
      }

      // Derive name from filename
      const baseName = file.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");

      const { error: insertErr } = await supabase
        .from("manufacturer_brochures")
        .insert({
          name: baseName,
          brand: "",
          file_path: path,
          sort_order: brochures.length,
        } as any);

      if (insertErr) {
        toast.error(`Save failed: ${insertErr.message}`);
      }
    }

    toast.success("Brochure(s) uploaded");
    setUploading(false);
    fetchBrochures();
    e.target.value = "";
  };

  const handleDelete = async (b: Brochure) => {
    await supabase.storage.from("manufacturer-brochures").remove([b.file_path]);
    await supabase.from("manufacturer_brochures").delete().eq("id", b.id);
    toast.success("Brochure deleted");
    fetchBrochures();
  };

  const handleSaveEdit = async (id: string) => {
    await supabase
      .from("manufacturer_brochures")
      .update({ name: editName, brand: editBrand, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    setEditingId(null);
    toast.success("Updated");
    fetchBrochures();
  };

  const handleToggleActive = async (b: Brochure) => {
    await supabase
      .from("manufacturer_brochures")
      .update({ is_active: !b.is_active } as any)
      .eq("id", b.id);
    fetchBrochures();
  };

  const getPublicUrl = (path: string) =>
    supabase.storage.from("manufacturer-brochures").getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Manufacturer Brochures
          </CardTitle>
          <CardDescription className="text-xs">
            Upload PDF brochures from equipment manufacturers. These can be emailed to customers with estimates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload area */}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors">
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Click or drag PDF files to upload</span>
              </>
            )}
            <input
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>

          {/* Brochure list */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
          ) : brochures.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No brochures uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {brochures.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <FileText className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === b.id ? (
                      <div className="space-y-1.5">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Brochure name"
                          className="h-7 text-xs"
                        />
                        <Input
                          value={editBrand}
                          onChange={(e) => setEditBrand(e.target.value)}
                          placeholder="Brand (e.g. Carrier, Trane)"
                          className="h-7 text-xs"
                        />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-xs" onClick={() => handleSaveEdit(b.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          setEditingId(b.id);
                          setEditName(b.name);
                          setEditBrand(b.brand);
                        }}
                      >
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        {b.brand && (
                          <Badge variant="secondary" className="text-[10px] mt-0.5">
                            {b.brand}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPreviewUrl(getPublicUrl(b.file_path))}
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <a
                    href={getPublicUrl(b.file_path)}
                    target="_blank"
                    rel="noopener"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <Switch
                    checked={b.is_active}
                    onCheckedChange={() => handleToggleActive(b)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(b)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* PDF Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl h-[80dvh]">
          <DialogHeader>
            <DialogTitle>Brochure Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <MediaViewer url={previewUrl} fileName="brochure.pdf" category="pdf" maxHeightClass="max-h-[75dvh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
