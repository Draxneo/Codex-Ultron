import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ImagePlus, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEquipmentMatchups, TIERS, APPLICATIONS, SYSTEM_TYPES } from "@/hooks/useEquipmentMatchups";

interface ExtractedRow {
  brand: string;
  condenser_model: string;
  coil_model?: string;
  furnace_model?: string;
  tonnage?: number;
  seer2?: number;
  eer2?: number;
  hspf2?: number;
  afue?: number;
  cooling_cap?: number;
  system_type?: string;
  application?: string;
  tier?: string;
  ahri_number?: string;
  heat_kit?: string;
  _selected: boolean;
}

export function EquipmentImageExtractor() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [brandHint, setBrandHint] = useState("");
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { addMatchup } = useEquipmentMatchups();

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image required", description: "Drop a spec sheet or AHRI screenshot.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setRows([]);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `catalog-extract/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("agent-documents").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("agent-documents").getPublicUrl(path);
      setImageUrl(publicUrl);

      // Auto-trigger extraction
      setExtracting(true);
      const { data, error } = await supabase.functions.invoke("extract-equipment-photo", {
        body: {
          image_url: publicUrl,
          type: "matchup_table",
          ...(brandHint ? { brand_hint: brandHint } : {}),
        },
      });
      if (error) throw error;
      const matchups = (data?.extracted?.matchups || []) as Omit<ExtractedRow, "_selected">[];
      if (matchups.length === 0) {
        toast({ title: "No matchups found", description: "Try a clearer image or a different page.", variant: "destructive" });
      } else {
        setRows(matchups.map(m => ({ ...m, _selected: true })));
        toast({ title: `Found ${matchups.length} matchup${matchups.length !== 1 ? "s" : ""}`, description: "Review and click Add to Catalog." });
      }
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  }, [brandHint, toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) handleFile(file);
  };

  const updateRow = (idx: number, patch: Partial<ExtractedRow>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const addSelected = async () => {
    const selected = rows.filter(r => r._selected);
    if (selected.length === 0) {
      toast({ title: "Nothing selected", variant: "destructive" });
      return;
    }
    setAdding(true);
    let success = 0;
    let failed = 0;
    for (const r of selected) {
      try {
        await addMatchup.mutateAsync({
          brand: r.brand,
          system_type: r.system_type ?? null,
          tier: r.tier ?? null,
          application: r.application ?? "Multiposition",
          condenser_model: r.condenser_model,
          furnace_model: r.furnace_model ?? null,
          coil_model: r.coil_model ?? null,
          tonnage: r.tonnage ?? null,
          seer2: r.seer2 ?? null,
          eer2: r.eer2 ?? null,
          hspf2: r.hspf2 ?? null,
          cooling_cap: r.cooling_cap ?? null,
          afue: r.afue ?? null,
          ahri_number: r.ahri_number ?? null,
          ahri_certificate_path: null,
          heat_kit: r.heat_kit ?? null,
          component_price: null,
          total_price: null,
          factory_rebate_price: null,
          monthly_payment: null,
          monthly_payment_120: null,
          cps_tonnage: null,
          early_rebate: null,
          burnout_rebate: null,
          notes: imageUrl ? `Extracted from image: ${imageUrl}` : null,
          low_margin_price: null,
          cps_rebate_tier: null,
          features_benefits: null,
        });
        success++;
      } catch {
        failed++;
      }
    }
    setAdding(false);
    toast({
      title: `Added ${success} matchup${success !== 1 ? "s" : ""}`,
      description: failed > 0 ? `${failed} failed — check console` : "Catalog updated. Set component prices to enable pricing math.",
    });
    if (success > 0) {
      setRows([]);
      setImageUrl(null);
    }
  };

  const reset = () => {
    setRows([]);
    setImageUrl(null);
    setBrandHint("");
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Extract Matchups from Image
            <span className="text-xs text-muted-foreground font-normal">— spec sheet, brochure, or AHRI screenshot</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="p-3 pt-0 space-y-3">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Brand hint (optional, e.g. Bosch, Mitsubishi)"
            value={brandHint}
            onChange={e => setBrandHint(e.target.value)}
            className="h-9 text-xs flex-1"
          />
          {(rows.length > 0 || imageUrl) && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-9 gap-1 text-xs">
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onPaste={handlePaste}
          tabIndex={0}
          className="rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 transition-colors p-4 text-center focus:outline-none focus:border-primary/60"
        >
          {uploading || extracting ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">{uploading ? "Uploading..." : "JARVIS is reading the image..."}</span>
            </div>
          ) : imageUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={imageUrl} alt="Source" className="max-h-32 rounded border border-border" />
              <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""} extracted</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground py-2">
              <Upload className="h-5 w-5" />
              <span className="text-xs">Drop image, paste (Ctrl+V), or click to upload</span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-3 w-3" />
                Choose file
              </Button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {rows.length > 0 && (
          <>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2"></TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs">Condenser</TableHead>
                    <TableHead className="text-xs">Coil</TableHead>
                    <TableHead className="text-xs">Furnace</TableHead>
                    <TableHead className="text-xs">Ton</TableHead>
                    <TableHead className="text-xs">SEER2</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Orient.</TableHead>
                    <TableHead className="text-xs">Tier</TableHead>
                    <TableHead className="text-xs">AHRI</TableHead>
                    <TableHead className="w-8 px-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="px-2 py-1">
                        <Checkbox checked={r._selected} onCheckedChange={c => updateRow(idx, { _selected: !!c })} />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input value={r.brand} onChange={e => updateRow(idx, { brand: e.target.value })} className="h-7 text-xs w-24" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input value={r.condenser_model} onChange={e => updateRow(idx, { condenser_model: e.target.value })} className="h-7 text-xs w-32" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input value={r.coil_model || ""} onChange={e => updateRow(idx, { coil_model: e.target.value })} className="h-7 text-xs w-28" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input value={r.furnace_model || ""} onChange={e => updateRow(idx, { furnace_model: e.target.value })} className="h-7 text-xs w-28" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input type="number" step="0.5" value={r.tonnage ?? ""} onChange={e => updateRow(idx, { tonnage: e.target.value ? Number(e.target.value) : undefined })} className="h-7 text-xs w-14" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input type="number" step="0.1" value={r.seer2 ?? ""} onChange={e => updateRow(idx, { seer2: e.target.value ? Number(e.target.value) : undefined })} className="h-7 text-xs w-16" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Select value={r.system_type || ""} onValueChange={v => updateRow(idx, { system_type: v })}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {SYSTEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        <Select value={r.application || "Multiposition"} onValueChange={v => updateRow(idx, { application: v })}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {APPLICATIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        <Select value={r.tier || ""} onValueChange={v => updateRow(idx, { tier: v })}>
                          <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        <Input value={r.ahri_number || ""} onChange={e => updateRow(idx, { ahri_number: e.target.value })} className="h-7 text-xs w-20" />
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(idx)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <span className="text-xs text-muted-foreground self-center mr-auto">
                {rows.filter(r => r._selected).length} of {rows.length} selected — prices will be $0 until you set component_price in the row editor
              </span>
              <Button size="sm" onClick={addSelected} disabled={adding} className="gap-1">
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Add {rows.filter(r => r._selected).length} to Catalog
              </Button>
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
