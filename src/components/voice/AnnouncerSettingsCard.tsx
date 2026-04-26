/**
 * AnnouncerSettingsCard — UI for the JARVIS voice announcer.
 *
 * Mounted in Admin → Voice. Per-device settings (localStorage) so each
 * machine controls whether it speaks aloud.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, Sparkles, PhoneIncoming, MessageSquare, Voicemail, Bell, Loader2 } from "lucide-react";
import { useAnnouncerSettings } from "@/hooks/useAnnouncerSettings";
import { useAnnouncer } from "@/hooks/useAnnouncer";

export function AnnouncerSettingsCard() {
  const { settings, update, setEvent } = useAnnouncerSettings();
  const { test, isPlaying } = useAnnouncer();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> JARVIS Voice Announcer
          <Badge variant="outline" className="text-[10px] ml-auto">This Device Only</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Spoken alerts in Daniel's butler voice for incoming calls, messages,
          and voicemails. Settings are per-device — your laptop can stay quiet
          while your office desktop announces.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Master toggle */}
        <div className={`flex items-center justify-between rounded-lg border p-3 ${
          settings.enabled ? "border-primary/30 bg-primary/5" : "border-border"
        }`}>
          <div className="flex items-start gap-2">
            <Volume2 className={`h-4 w-4 mt-0.5 ${settings.enabled ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <Label className="text-sm font-medium">Enable Announcer</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Master switch for this machine.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </div>

        {/* Test voice */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => test("Sir, all systems are operational. Voice check complete.")}
            disabled={isPlaying}
            className="gap-2"
          >
            {isPlaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
            {isPlaying ? "Speaking…" : "Test voice"}
          </Button>
          <span className="text-[11px] text-muted-foreground">Plays a sample regardless of master toggle.</span>
        </div>

        {/* Salutation */}
        <div className="space-y-1.5">
          <Label className="text-xs">Salutation prefix</Label>
          <Input
            value={settings.salutation}
            onChange={(e) => update({ salutation: e.target.value })}
            placeholder="Sir,"
            className="h-9 max-w-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Prepended to every announcement. Leave blank for no salutation.
          </p>
        </div>

        {/* Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Volume</Label>
            <span className="text-[11px] text-muted-foreground">{Math.round(settings.volume * 100)}%</span>
          </div>
          <Slider
            value={[settings.volume * 100]}
            onValueChange={([v]) => update({ volume: v / 100 })}
            min={10}
            max={100}
            step={5}
          />
        </div>

        {/* Speed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Speech speed</Label>
            <span className="text-[11px] text-muted-foreground">{settings.speed.toFixed(2)}×</span>
          </div>
          <Slider
            value={[settings.speed * 100]}
            onValueChange={([v]) => update({ speed: v / 100 })}
            min={70}
            max={120}
            step={5}
          />
          <p className="text-[11px] text-muted-foreground">
            ElevenLabs supports 0.7×–1.2×. Default 1.10× for a brisk butler delivery.
          </p>
        </div>

        {/* Per-event toggles */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Announce on</Label>

          <EventRow
            icon={<PhoneIncoming className="h-3.5 w-3.5" />}
            label="Incoming call"
            description="When the softphone rings."
            checked={settings.events.incomingCall}
            onChange={(v) => setEvent("incomingCall", v)}
          />
          <EventRow
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="New SMS"
            description="When an inbound text arrives."
            checked={settings.events.newSms}
            onChange={(v) => setEvent("newSms", v)}
          />
          <EventRow
            icon={<Voicemail className="h-3.5 w-3.5" />}
            label="New voicemail"
            description="When a recording is attached to an inbound call."
            checked={settings.events.voicemail}
            onChange={(v) => setEvent("voicemail", v)}
          />
          <EventRow
            icon={<Bell className="h-3.5 w-3.5" />}
            label="JARVIS needs approval"
            description="When a draft message is queued for review. Off by default — can be noisy."
            checked={settings.events.jarvisAlert}
            onChange={(v) => setEvent("jarvisAlert", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-start gap-2 min-w-0">
        <div className="text-muted-foreground mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm">{label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
