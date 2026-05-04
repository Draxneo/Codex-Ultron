import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield, Leaf, Zap, Thermometer, DollarSign, VolumeX, Fan, Snowflake, Sun, Wrench, Award, CheckCircle2,
  Plus, Trash2, GripVertical, Copy,
} from "lucide-react";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

const ICON_OPTIONS = [
  { value: "shield", label: "Shield", Icon: Shield },
  { value: "leaf", label: "Leaf", Icon: Leaf },
  { value: "zap", label: "Zap", Icon: Zap },
  { value: "thermometer", label: "Thermometer", Icon: Thermometer },
  { value: "dollar-sign", label: "Dollar", Icon: DollarSign },
  { value: "volume-x", label: "Quiet", Icon: VolumeX },
  { value: "fan", label: "Fan", Icon: Fan },
  { value: "snowflake", label: "Snowflake", Icon: Snowflake },
  { value: "sun", label: "Sun", Icon: Sun },
  { value: "wrench", label: "Wrench", Icon: Wrench },
  { value: "award", label: "Award", Icon: Award },
  { value: "check-circle", label: "Check", Icon: CheckCircle2 },
] as const;

export function getFeatureIcon(iconName: string) {
  const found = ICON_OPTIONS.find(i => i.value === iconName);
  return found ? found.Icon : CheckCircle2;
}

interface FeatureBullet {
  icon: string;
  text: string;
}

interface Props {
  matchup: EquipmentMatchup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function normalizeFeatures(value: unknown): FeatureBullet[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item.text === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.text === "string") : [];
  } catch {
    return [];
  }
}

export function FeaturesEditor({ matchup, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [features, setFeatures] = useState<FeatureBullet[]>(normalizeFeatures(matchup.features_benefits));
  const [saving, setSaving] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);

  const addFeature = () => {
    setFeatures(prev => [...prev, { icon: "check-circle", text: "" }]);
  };

  const removeFeature = (idx: number) => {
    setFeatures(prev => prev.filter((_, i) => i !== idx));
  };

  const updateFeature = (idx: number, field: keyof FeatureBullet, value: string) => {
    setFeatures(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleaned = features.filter(f => f.text.trim());
      const { error } = await supabase
        .from("equipment_matchups" as any)
        .update({ features_benefits: JSON.stringify(cleaned) } as any)
        .eq("id", matchup.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
      toast({ title: "Features saved" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkApply = async () => {
    if (!matchup.brand || !matchup.tier) {
      toast({ title: "Need brand + tier to bulk apply", variant: "destructive" });
      return;
    }
    setBulkApplying(true);
    try {
      const cleaned = features.filter(f => f.text.trim());
      const { error } = await supabase
        .from("equipment_matchups" as any)
        .update({ features_benefits: JSON.stringify(cleaned) } as any)
        .eq("brand", matchup.brand)
        .eq("tier", matchup.tier);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
      toast({ title: `Applied to all ${matchup.brand} ${matchup.tier} matchups` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Features & Benefits</DialogTitle>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="secondary">{matchup.brand}</Badge>
            {matchup.tier && <Badge variant="outline">{matchup.tier}</Badge>}
            <Badge variant="outline">{matchup.condenser_model}</Badge>
            {matchup.tonnage && <Badge variant="outline">{matchup.tonnage}T</Badge>}
            {matchup.seer2 && <Badge variant="outline">{matchup.seer2} SEER2</Badge>}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {features.map((f, idx) => {
            const IconComp = getFeatureIcon(f.icon);
            return (
              <div key={idx} className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <Select value={f.icon} onValueChange={(v) => updateFeature(idx, "icon", v)}>
                  <SelectTrigger className="w-[100px] h-9 text-xs">
                    <div className="flex items-center gap-1.5">
                      <IconComp className="h-3.5 w-3.5" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.Icon className="h-3.5 w-3.5" />
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={f.text}
                  onChange={e => updateFeature(idx, "text", e.target.value)}
                  placeholder="e.g. 10-Year Parts Warranty"
                  className="h-9 text-sm flex-1"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive" onClick={() => removeFeature(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          <Button variant="outline" size="sm" onClick={addFeature} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Feature
          </Button>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          {matchup.brand && matchup.tier && (
            <Button variant="secondary" size="sm" onClick={handleBulkApply} disabled={bulkApplying || saving} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              {bulkApplying ? "Applying..." : `Apply to all ${matchup.brand} ${matchup.tier}`}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || bulkApplying}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}