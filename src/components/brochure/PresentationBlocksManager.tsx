import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Plus, Trash2, BookOpen, Snowflake, ShieldCheck, Volume2,
  Wrench, Gauge, Settings, Droplets, Zap, Award, Wind, Wifi,
  BarChart3, ThermometerSun, Leaf,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Snowflake, ShieldCheck, Volume2, Wrench, Gauge, Settings, Droplets,
  Zap, Award, Wind, Wifi, BarChart3, ThermometerSun, Leaf,
};
const ICON_OPTIONS = Object.keys(ICON_MAP);

interface Feature { icon: string; title: string; desc: string; }

interface BrochureBlock {
  id: string; series: string; brand: string; label: string; tagline: string;
  sort_order: number; compressor_type: string; sound_level: string;
  humidity_desc: string; expected_lifespan: string; features: Feature[];
  header_gradient: string; accent_color: string; accent_bg: string;
  tier_color: string; tier_bg: string;
}

export default function BrochureBlocksManager() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<BrochureBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBlock, setEditingBlock] = useState<BrochureBlock | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchBlocks = async () => {
    setLoading(true);
    const { data } = await supabase.from("brochure_blocks").select("*").order("sort_order");
    if (data) setBlocks(data.map((b: any) => ({ ...b, features: (b.features || []) as Feature[] })));
    setLoading(false);
  };

  useEffect(() => { fetchBlocks(); }, []);

  const saveBlock = async () => {
    if (!editingBlock) return;
    setSaving(true);
    const { id, ...rest } = editingBlock;
    const payload = { ...rest, features: JSON.parse(JSON.stringify(rest.features)) };
    const { error } = await supabase.from("brochure_blocks").update(payload).eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Brochure block saved" });
      setEditingBlock(null);
      fetchBlocks();
    }
    setSaving(false);
  };

  const updateFeature = (index: number, field: keyof Feature, value: string) => {
    if (!editingBlock) return;
    const newFeatures = [...editingBlock.features];
    newFeatures[index] = { ...newFeatures[index], [field]: value };
    setEditingBlock({ ...editingBlock, features: newFeatures });
  };

  const addFeature = () => {
    if (!editingBlock) return;
    setEditingBlock({ ...editingBlock, features: [...editingBlock.features, { icon: "Snowflake", title: "", desc: "" }] });
  };

  const removeFeature = (index: number) => {
    if (!editingBlock) return;
    setEditingBlock({ ...editingBlock, features: editingBlock.features.filter((_, i) => i !== index) });
  };

  const brandColors: Record<string, string> = {
    goodman: "border-l-green-500", dayandnight: "border-l-emerald-600", carrier: "border-l-primary",
  };

  if (loading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading brochure blocks...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Brochure Content Blocks</CardTitle>
        <p className="text-sm text-muted-foreground">
          Manage the content that appears on customer brochures. Use <code className="text-xs bg-muted px-1 rounded">{"{seer2}"}</code>, <code className="text-xs bg-muted px-1 rounded">{"{eer2}"}</code>, <code className="text-xs bg-muted px-1 rounded">{"{hspf2}"}</code> as placeholders.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map(block => {
            const IconComp = ICON_MAP[block.features[0]?.icon] || Snowflake;
            return (
              <div key={block.id} onClick={() => setEditingBlock({ ...block })}
                className={cn("cursor-pointer rounded-xl border-l-4 border bg-background p-5 hover:shadow-md transition-all", brandColors[block.brand] || "border-l-muted")}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{block.brand}</span>
                    <h4 className="text-lg font-bold text-foreground">{block.label}</h4>
                    <p className="text-xs text-muted-foreground">{block.series}</p>
                  </div>
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", block.accent_bg)}>
                    <IconComp className={cn("h-5 w-5", block.accent_color)} />
                  </div>
                </div>
                <p className="text-sm italic text-muted-foreground mb-3">"{block.tagline}"</p>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {[{ l: "Compressor", v: block.compressor_type },{ l: "Sound", v: block.sound_level },{ l: "Humidity", v: block.humidity_desc },{ l: "Lifespan", v: block.expected_lifespan }].map(s => (
                    <div key={s.l} className="rounded bg-muted/50 px-2 py-1">
                      <span className="text-muted-foreground">{s.l}:</span>
                      <span className="ml-1 font-semibold text-foreground">{s.v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[10px] text-muted-foreground">{block.features.length} feature block{block.features.length !== 1 ? "s" : ""}</div>
              </div>
            );
          })}
        </div>

        <Dialog open={!!editingBlock} onOpenChange={(open) => { if (!open) setEditingBlock(null); }}>
          <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit: {editingBlock?.series} — {editingBlock?.label}</DialogTitle></DialogHeader>
            {editingBlock && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Display Label</Label><Input value={editingBlock.label} onChange={e => setEditingBlock({ ...editingBlock, label: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Tagline</Label><Input value={editingBlock.tagline} onChange={e => setEditingBlock({ ...editingBlock, tagline: e.target.value })} /></div>
                </div>
                <div>
                  <Label className="text-base font-semibold mb-3 block">Spec Defaults</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[{ l: "Compressor Type", k: "compressor_type" as const },{ l: "Sound Level", k: "sound_level" as const },{ l: "Humidity Description", k: "humidity_desc" as const },{ l: "Expected Lifespan", k: "expected_lifespan" as const }].map(f => (
                      <div key={f.k} className="space-y-1">
                        <Label className="text-xs">{f.l}</Label>
                        <Input value={(editingBlock as any)[f.k]} onChange={e => setEditingBlock({ ...editingBlock, [f.k]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">Feature Blocks</Label>
                    <Button size="sm" variant="outline" onClick={addFeature}><Plus className="mr-1 h-3.5 w-3.5" /> Add Feature</Button>
                  </div>
                  <div className="space-y-4">
                    {editingBlock.features.map((feat, i) => {
                      const FeatIcon = ICON_MAP[feat.icon] || Snowflake;
                      return (
                        <div key={i} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2"><FeatIcon className="h-4 w-4 text-primary" /><span className="text-xs font-bold text-muted-foreground">Feature {i + 1}</span></div>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeFeature(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                          <div className="space-y-2"><Label className="text-xs">Icon</Label>
                            <select value={feat.icon} onChange={e => updateFeature(i, "icon", e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                              {ICON_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2"><Label className="text-xs">Title</Label><Input value={feat.title} onChange={e => updateFeature(i, "title", e.target.value)} /></div>
                          <div className="space-y-2"><Label className="text-xs">Description</Label><Textarea value={feat.desc} onChange={e => updateFeature(i, "desc", e.target.value)} className="min-h-[60px] text-sm" /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Button onClick={saveBlock} disabled={saving} className="w-full"><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save Changes"}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}