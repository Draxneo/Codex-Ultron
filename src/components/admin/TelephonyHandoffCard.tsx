/**
 * TelephonyHandoffCard — Admin → Config → Voice & Phone
 *
 * Single toggle that hands off ALL phone & SMS UI in this app to Ultraphone
 * (Office Connect). When ON:
 *   - Every Click-to-Call / SMS button opens Ultraphone instead of the in-app dialer
 *   - The in-app softphone is disabled (no Twilio register, no mic prompt, no ring)
 *   - Phone / SMS / Voicemail tabs are hidden, /calls /sms /phone show a redirect card
 *   - Incoming-call notifications are suppressed
 *
 * Backend stays shared, so call_log / sms_log entries always show up here either way.
 * Flip OFF to instantly restore everything — nothing is deleted.
 */
import { useState, useEffect } from "react";
import { ExternalLink, PhoneForwarded } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

const DEFAULT_URL = "https://ultraphone.lovable.app";

export function TelephonyHandoffCard() {
  const { settings, updateSettings } = useCompanySettings();
  const telephony = useTelephonyMode();
  const enabledRaw = (settings as any)?.telephony_handoff_enabled;
  const urlRaw = (settings as any)?.telephony_handoff_url;

  const enabled = enabledRaw === "true" || enabledRaw === true;
  const [urlDraft, setUrlDraft] = useState<string>(urlRaw || DEFAULT_URL);

  useEffect(() => {
    if (typeof urlRaw === "string") setUrlDraft(urlRaw || DEFAULT_URL);
  }, [urlRaw]);

  const handleToggle = (checked: boolean) => {
    updateSettings.mutate({
      telephony_handoff_enabled: checked ? "true" : "false",
    } as any);
  };

  const handleSaveUrl = () => {
    const cleaned = (urlDraft || "").trim() || DEFAULT_URL;
    updateSettings.mutate({ telephony_handoff_url: cleaned } as any);
  };

  const handleTest = () => {
    void telephony.openHome();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PhoneForwarded className="h-5 w-5 text-primary" />
          Telephony Handoff
          {enabled ? (
            <Badge variant="default" className="ml-2">Handoff ON</Badge>
          ) : (
            <Badge variant="outline" className="ml-2">In-app</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Move all phone calls, SMS, and voicemail handling to Ultraphone (Office Connect)
          while keeping the same shared backend. Flip OFF anytime to bring everything back —
          nothing is deleted.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
          <div className="space-y-1">
            <Label htmlFor="telephony-handoff" className="text-sm font-semibold">
              Hand off calls and SMS to Ultraphone
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "Calls, SMS, and voicemail now launch Ultraphone on desktop, Electron, and mobile. This app keeps history and logs only."
                : "Calls and SMS are handled inside this app. The Ultraphone window is not used."}
            </p>
          </div>
          <Switch
            id="telephony-handoff"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={updateSettings.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="telephony-handoff-url" className="text-sm">
            Ultraphone URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="telephony-handoff-url"
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder={DEFAULT_URL}
              onBlur={handleSaveUrl}
            />
            <Button type="button" variant="outline" onClick={handleTest} className="shrink-0">
              <ExternalLink className="mr-2 h-4 w-4" />
              Test launch
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use a full https URL for browser-based handoff, or a custom scheme such as <code className="text-foreground">ultraphone://</code>
            to prefer the native app on supported devices.
          </p>
        </div>

        {enabled && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Heads up</p>
            <p className="mt-1">
              Handoff now applies to office desktops, Electron tray launches, and tech mobile devices.
              Customer detail pages still show call and SMS history here, but every live telephony action opens Ultraphone.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
