/**
 * Shared IVR editor sub-components: TimePicker, DayPicker, AudioUploadField
 */
import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { UniversalMediaPlayer } from "@/components/media";

export const DAYS = [
  { value: 0, label: "S", full: "Sun" },
  { value: 1, label: "M", full: "Mon" },
  { value: 2, label: "T", full: "Tue" },
  { value: 3, label: "W", full: "Wed" },
  { value: 4, label: "T", full: "Thu" },
  { value: 5, label: "F", full: "Fri" },
  { value: 6, label: "S", full: "Sat" },
];

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

export function parse24(time: string): { hour: number; minute: string; period: "AM" | "PM" } {
  const [h, m] = time.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minute = String(m).padStart(2, "0");
  const snapped = MINUTES.reduce((prev, cur) =>
    Math.abs(Number(cur) - Number(minute)) < Math.abs(Number(prev) - Number(minute)) ? cur : prev
  );
  return { hour, minute: snapped, period };
}

export function to24(hour: number, minute: string, period: "AM" | "PM"): string {
  let h = hour;
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

export function formatTime12(time: string): string {
  const { hour, minute, period } = parse24(time);
  return `${hour}:${minute} ${period}`;
}

export function TimePicker({ value, onChange, label }: { value: string; onChange: (val: string) => void; label?: string }) {
  const parsed = parse24(value);
  const update = (h?: number, m?: string, p?: "AM" | "PM") => {
    onChange(to24(h ?? parsed.hour, m ?? parsed.minute, p ?? parsed.period));
  };

  return (
    <div className="space-y-1">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-1">
        <Select value={String(parsed.hour)} onValueChange={(v) => update(Number(v))}>
          <SelectTrigger className="w-16 h-9 text-sm font-medium"><SelectValue /></SelectTrigger>
          <SelectContent>
            {HOURS.map((h) => <SelectItem key={h} value={String(h)} className="text-sm">{h}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground font-bold">:</span>
        <Select value={parsed.minute} onValueChange={(v) => update(undefined, v)}>
          <SelectTrigger className="w-16 h-9 text-sm font-medium"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MINUTES.map((m) => <SelectItem key={m} value={m} className="text-sm">{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button onClick={() => update(undefined, undefined, "AM")} className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${parsed.period === "AM" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>AM</button>
          <button onClick={() => update(undefined, undefined, "PM")} className={`px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-border ${parsed.period === "PM" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>PM</button>
        </div>
      </div>
    </div>
  );
}

export function DayPicker({ selected, onChange }: { selected: number[]; onChange: (days: number[]) => void }) {
  const toggle = (day: number) => {
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day].sort();
    onChange(next);
  };

  return (
    <div className="flex gap-1">
      {DAYS.map((day) => (
        <button key={day.value} onClick={() => toggle(day.value)} title={day.full}
          className={`w-8 h-8 rounded-full text-xs font-medium transition-all ${selected.includes(day.value) ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
          {day.label}
        </button>
      ))}
    </div>
  );
}

export function AudioUploadField({ label, audioUrl, textValue, onTextChange, onAudioChange, placeholder, bucketPath, allowTextInput = true }: {
  label: string; audioUrl: string | null; textValue: string; onTextChange: (val: string) => void; onAudioChange: (url: string | null) => void; placeholder: string; bucketPath: string; allowTextInput?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Max 10MB", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${bucketPath}/${safeName}`;
      const extension = safeName.split(".").pop()?.toLowerCase();
      const contentType =
        extension === "mp3" ? "audio/mpeg" :
        extension === "wav" ? "audio/wav" :
        file.type || "application/octet-stream";
      const { error } = await supabase.storage.from("ivr-greetings").upload(path, file, {
        upsert: true,
        contentType,
        cacheControl: "300",
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("ivr-greetings").getPublicUrl(path);
      onAudioChange(publicUrl);
      toast({ title: "Audio uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
      <Label className="text-xs font-semibold">{label}</Label>
      {audioUrl ? (
        <div className="flex items-center gap-2 p-2.5 bg-background rounded-md border">
          <Badge variant="secondary" className="text-[10px] shrink-0">Custom Audio</Badge>
          <span className="text-xs text-muted-foreground truncate flex-1">{audioUrl.split("/").pop()}</span>
          <UniversalMediaPlayer src={audioUrl} kind="audio" variant="compact" className="h-7 w-7" />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onAudioChange(null)}>
            <X className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ) : allowTextInput ? (
        <Textarea value={textValue} onChange={(e) => onTextChange(e.target.value)} className="text-sm min-h-[56px] bg-background" placeholder={placeholder} />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
          Upload an audio file to use as caller hold music.
        </div>
      )}
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" className="hidden" onChange={handleUpload} />
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="h-3 w-3" />
          {uploading ? "Uploading…" : audioUrl ? "Replace" : "Upload audio"}
        </Button>
        {!audioUrl && allowTextInput && <span className="text-[10px] text-muted-foreground">Or type text-to-speech above</span>}
      </div>
    </div>
  );
}
