/**
 * TechFormConfigView — ONE universal tech form view for the Workflow Builder.
 * Shows a linear Snap & Talk flow at the top, then per-job-type configuration
 * toggles for photos, fields, and pricebook categories below.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Truck, Camera, Mic, Brain, ShoppingCart, MessageSquare,
  ImagePlus, Flag, Zap, CheckCircle, ArrowRight, Wrench,
  Snowflake, Flame, Settings2
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Universal flow steps ── */
const FLOW_STEPS = [
  { id: "omw", label: "On My Way", icon: Truck, detail: "ETA text sent" },
  { id: "arrive", label: "Arrive", icon: CheckCircle, detail: "GPS confirms" },
  { id: "snap", label: "Snap Photos", icon: Camera, detail: "AI OCR extracts specs", ai: true },
  { id: "talk", label: "Voice Memo", icon: Mic, detail: "Deepgram → Gemini", ai: true },
  { id: "review", label: "AI Review", icon: Brain, detail: "Editable summary", ai: true },
  { id: "parts", label: "Add Parts", icon: ShoppingCart, detail: "Pricebook / JARVIS" },
  { id: "after", label: "After Photos", icon: ImagePlus, detail: "Document work" },
  { id: "submit", label: "Submit", icon: Flag, detail: "Advances workflow" },
];

/* ── Per-type photo presets ── */
const PHOTO_OPTIONS: Record<string, { key: string; label: string; default: boolean }[]> = {
  service: [
    { key: "data_plate", label: "Data Plate", default: true },
    { key: "before", label: "Before Photos", default: true },
    { key: "gauges", label: "Gauge / Multimeter", default: true },
    { key: "after", label: "After Photos", default: true },
  ],
  estimate: [
    { key: "data_plate", label: "Data Plate", default: true },
    { key: "site", label: "Site Photos", default: true },
    { key: "existing", label: "Existing Equipment", default: true },
    { key: "after", label: "After Photos", default: false },
  ],
  maintenance: [
    { key: "data_plate", label: "Data Plate", default: true },
    { key: "gauges", label: "Gauge Readings", default: true },
    { key: "capacitor", label: "Capacitor", default: true },
    { key: "filter", label: "Filter", default: true },
  ],
  install: [
    { key: "old_data_plate", label: "Old Data Plate", default: true },
    { key: "before", label: "Before Photos", default: true },
    { key: "new_data_plate", label: "New Data Plate", default: true },
    { key: "after", label: "After Photos", default: true },
  ],
};

/* ── Pricebook categories ── */
const PRICEBOOK_CATS = [
  { key: "electrical", label: "Electrical", emoji: "⚡" },
  { key: "motors", label: "Motors", emoji: "🔧" },
  { key: "cleaning", label: "Cleaning", emoji: "🧹" },
  { key: "refrigerant", label: "Refrigerant", emoji: "❄️" },
  { key: "diagnostic", label: "Diagnostic", emoji: "🔍" },
  { key: "ductwork", label: "Ductwork", emoji: "🌀" },
];

export function TechFormConfigView() {
  const [jobType, setJobType] = useState("service");
  const photos = PHOTO_OPTIONS[jobType] || PHOTO_OPTIONS.service;
  const [enabledPhotos, setEnabledPhotos] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    photos.forEach(p => { m[p.key] = p.default; });
    return m;
  });
  const [enabledCats, setEnabledCats] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    PRICEBOOK_CATS.forEach(c => { m[c.key] = true; });
    return m;
  });

  // Reset photo toggles on job type change
  const handleJobTypeChange = (type: string) => {
    setJobType(type);
    const newPhotos = PHOTO_OPTIONS[type] || PHOTO_OPTIONS.service;
    const m: Record<string, boolean> = {};
    newPhotos.forEach(p => { m[p.key] = p.default; });
    setEnabledPhotos(m);
  };

  return (
    <div className="space-y-6">
      {/* ── Universal Flow Diagram ── */}
      <Card className="p-5 bg-card border">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-xs font-semibold gap-1">
            <Zap className="h-3 w-3" /> Universal Tech Flow
          </Badge>
          <span className="text-xs text-muted-foreground">Same for every job type</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {FLOW_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                <div className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-3 min-w-[100px] transition-colors",
                  step.ai
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-border bg-card"
                )}>
                  <div className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center",
                    step.ai ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-xs font-semibold text-center">{step.label}</span>
                  <span className="text-[9px] text-muted-foreground text-center leading-tight">{step.detail}</span>
                  {step.ai && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[8px] gap-0.5 mt-0.5">
                      <Zap className="h-2 w-2" /> AI
                    </Badge>
                  )}
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Job Type Selector ── */}
      <div className="flex items-center gap-3">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Configure fields for:</span>
        <Select value={jobType} onValueChange={handleJobTypeChange}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="estimate">Estimate</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="install">Install</SelectItem>
          </SelectContent>
        </Select>
        {jobType === "maintenance" && (
          <div className="flex items-center gap-2 ml-4 bg-muted/50 rounded-lg px-3 py-1.5 border">
            <Snowflake className="h-3.5 w-3.5 text-sky-500" />
            <span className="text-xs text-muted-foreground">/</span>
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-muted-foreground">Season-aware fields loaded from database</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Photo Categories ── */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Required Photos</h3>
            <Badge variant="outline" className="ml-auto text-[10px] capitalize">{jobType}</Badge>
          </div>
          <div className="space-y-3">
            {photos.map(p => (
              <div key={p.key} className="flex items-center justify-between">
                <Label className="text-sm cursor-pointer">{p.label}</Label>
                <Switch
                  checked={enabledPhotos[p.key] ?? p.default}
                  onCheckedChange={(v) => setEnabledPhotos(prev => ({ ...prev, [p.key]: v }))}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            AI OCR extracts model #, serial #, brand, and readings from all photos automatically.
          </p>
        </Card>

        {/* ── Pricebook Categories ── */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Pricebook Categories</h3>
            <Badge variant="outline" className="ml-auto text-[10px]">Visual Grid</Badge>
          </div>
          <div className="space-y-3">
            {PRICEBOOK_CATS.map(c => (
              <div key={c.key} className="flex items-center justify-between">
                <Label className="text-sm cursor-pointer flex items-center gap-2">
                  <span>{c.emoji}</span> {c.label}
                </Label>
                <Switch
                  checked={enabledCats[c.key] ?? true}
                  onCheckedChange={(v) => setEnabledCats(prev => ({ ...prev, [c.key]: v }))}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Techs see these as big tap-to-add cards on the pricebook drawer.
          </p>
        </Card>
      </div>

      {/* ── Always Available Tools ── */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Always Available (All Job Types)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 bg-accent/10 rounded-xl px-4 py-3 border">
            <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center shrink-0">
              <ShoppingCart className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Visual Pricebook</p>
              <p className="text-xs text-muted-foreground">Tap-to-add parts grid — always accessible via FAB</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-primary/10 rounded-xl px-4 py-3 border">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">JARVIS</p>
              <p className="text-xs text-muted-foreground">Photo → find part #, text supply house, get price & availability</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
