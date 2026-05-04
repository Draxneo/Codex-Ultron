import { useState, useRef } from "react";
import { Volume2, Play, Upload, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RINGTONE_OPTIONS, previewRingtone, isCustomRingtone } from "@/lib/softphoneAudio";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function useSoftphoneSetting(key: string, fallback: string) {
  return useQuery({
    queryKey: ["company_settings", key],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      return (data as any)?.value ?? fallback;
    },
  });
}

function useUpsertSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data } = await supabase
        .from("company_settings")
        .update({ value, updated_at: new Date().toISOString() } as any)
        .eq("key", key)
        .select("id");
      if (!data || (data as any[]).length === 0) {
        await supabase.from("company_settings").insert({ key, value } as any);
      }
    },
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ["company_settings", key] });
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      toast({ title: "Setting saved" });
    },
  });
}

function useCustomRingtones() {
  return useQuery({
    queryKey: ["custom_ringtones"],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("ringtones").list("", { limit: 50 });
      if (error) throw error;
      return (data || []).filter((f) => !f.name.startsWith(".")).map((f) => ({
        name: f.name,
        url: supabase.storage.from("ringtones").getPublicUrl(f.name).data.publicUrl,
      }));
    },
  });
}

export function RingtoneSettingsCard() {
  const { data: currentRingtone = "classic" } = useSoftphoneSetting("softphone_ringtone", "classic");
  const { data: dialTonesVal = "true" } = useSoftphoneSetting("softphone_dial_tones", "true");
  const { data: smsAlertVal = "true" } = useSoftphoneSetting("sms_alert_sound", "true");
  const { data: customRingtones = [], refetch: refetchCustom } = useCustomRingtones();
  const upsert = useUpsertSetting();
  const qc = useQueryClient();
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dialTonesEnabled = dialTonesVal !== "false";
  const smsAlertEnabled = smsAlertVal !== "false";

  const getCustomUrl = (ringtoneId: string): string | undefined => {
    if (!isCustomRingtone(ringtoneId)) return undefined;
    const fileName = ringtoneId.replace("custom:", "");
    return customRingtones.find((r) => r.name === fileName)?.url;
  };

  const handlePreview = (id: string) => {
    setPreviewing(true);
    previewRingtone(id, getCustomUrl(id));
    setTimeout(() => setPreviewing(false), 4000);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({ title: "File too large", description: "Max 10MB for ringtone files", variant: "destructive" });
      return;
    }

    const allowed = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/x-wav"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg)$/i)) {
      toast({ title: "Invalid format", description: "Upload MP3, WAV, or OGG files", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const extension = safeName.split(".").pop()?.toLowerCase();
      const contentType =
        extension === "mp3" ? "audio/mpeg" :
        extension === "wav" ? "audio/wav" :
        extension === "ogg" ? "audio/ogg" :
        file.type || "application/octet-stream";
      const { error } = await supabase.storage.from("ringtones").upload(safeName, file, {
        upsert: true,
        contentType,
        cacheControl: "300",
      });
      if (error) throw error;

      await refetchCustom();
      // Auto-select the uploaded ringtone
      upsert.mutate({ key: "softphone_ringtone", value: `custom:${safeName}` });
      toast({ title: "Ringtone uploaded", description: safeName });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteCustom = async (fileName: string) => {
    const { error } = await supabase.storage.from("ringtones").remove([fileName]);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    // If current ringtone is the deleted one, reset to classic
    if (currentRingtone === `custom:${fileName}`) {
      upsert.mutate({ key: "softphone_ringtone", value: "classic" });
    }
    refetchCustom();
    toast({ title: "Ringtone deleted" });
  };

  // Build combined options list
  const allOptions = [
    ...RINGTONE_OPTIONS.map((rt) => ({ id: rt.id, label: rt.label })),
    ...customRingtones.map((r) => ({ id: `custom:${r.name}`, label: `🎵 ${r.name.replace(/\.[^.]+$/, "")}` })),
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          Softphone Sounds
        </CardTitle>
        <CardDescription className="text-xs">
          Configure dial tones and incoming call ringtone for the in-app softphone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="dial-tones" className="text-sm">Keypad dial tones</Label>
          <Switch
            id="dial-tones"
            checked={dialTonesEnabled}
            onCheckedChange={(checked) => upsert.mutate({ key: "softphone_dial_tones", value: checked ? "true" : "false" })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="sms-alert" className="text-sm">SMS alert sound</Label>
          <Switch
            id="sms-alert"
            checked={smsAlertEnabled}
            onCheckedChange={(checked) => upsert.mutate({ key: "sms_alert_sound", value: checked ? "true" : "false" })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Incoming call ringtone</Label>
          <div className="flex gap-2">
            <Select value={currentRingtone} onValueChange={(v) => upsert.mutate({ key: "softphone_ringtone", value: v })}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allOptions.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePreview(currentRingtone)}
              disabled={currentRingtone === "none" || previewing}
              title="Preview ringtone"
            >
              <Play className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Upload custom ringtone */}
        <div className="space-y-2">
          <Label className="text-sm">Custom ringtone</Label>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload audio file"}
            </Button>
            <span className="text-[10px] text-muted-foreground self-center">MP3, WAV, OGG · Max 10 MB</span>
          </div>
        </div>

        {/* List custom ringtones */}
        {customRingtones.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Uploaded ringtones</Label>
            {customRingtones.map((r) => {
              const rid = `custom:${r.name}`;
              const isCurrent = currentRingtone === rid;
              return (
                <div key={r.name} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40 text-sm">
                  <span className="truncate flex-1">
                    🎵 {r.name.replace(/\.[^.]+$/, "")}
                    {isCurrent && <span className="ml-1.5 text-[10px] text-primary font-medium">(active)</span>}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handlePreview(rid)}
                      disabled={previewing}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCustom(r.name)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
