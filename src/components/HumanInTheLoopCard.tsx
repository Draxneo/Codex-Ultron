import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Bell } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";

export function HumanInTheLoopCard() {
  const { settings, isLoading, updateSettings } = useCompanySettings();
  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  if (isLoading) return null;

  const isTestMode = form.human_in_the_loop === "true";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Test Mode
          </CardTitle>
          <CardDescription className="text-xs">
            Control whether JARVIS auto-replies and AI drafts are active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Test Mode Toggle */}
          <div className={`flex items-center justify-between rounded-lg border p-3 ${
            isTestMode ? "border-amber-500/30 bg-amber-500/5" : "border-border"
          }`}>
            <div className="flex items-start gap-2">
              <ShieldCheck className={`h-4 w-4 mt-0.5 ${isTestMode ? "text-amber-500" : "text-muted-foreground"}`} />
              <div>
                <Label className="text-xs font-medium">
                  {isTestMode ? "Test Mode — Active" : "Test Mode — Off"}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {isTestMode
                    ? "JARVIS auto-replies and AI drafts are disabled. You can still send messages manually."
                    : "JARVIS is live — AI drafts queue for your approval, manual sends go out instantly."}
                </p>
              </div>
            </div>
            <Switch
              checked={isTestMode}
              onCheckedChange={(checked) => {
                set("human_in_the_loop", checked ? "true" : "false");
                updateSettings.mutate({ human_in_the_loop: checked ? "true" : "false" });
              }}
            />
          </div>

          {/* JARVIS Alert Phone */}
          <div className="rounded-lg border border-muted p-3 space-y-2">
            <div className="flex items-start gap-2 mb-1">
              <Bell className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <Label className="text-xs font-medium">JARVIS Alert Phone</Label>
                <p className="text-[10px] text-muted-foreground">
                  Get a text when outbox items need your approval. Checked every 5 minutes.
                </p>
              </div>
            </div>
            <Input
              value={form.jarvis_alert_phone || ""}
              onChange={(e) => set("jarvis_alert_phone", e.target.value)}
              onBlur={() => {
                const raw = (form.jarvis_alert_phone || "").replace(/\D/g, "");
                if (raw.length >= 10) {
                  const d = raw.slice(-10);
                  const formatted = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
                  set("jarvis_alert_phone", formatted);
                  updateSettings.mutate({ jarvis_alert_phone: formatted });
                } else if (raw.length === 0) {
                  set("jarvis_alert_phone", "");
                  updateSettings.mutate({ jarvis_alert_phone: "" });
                }
              }}
              placeholder="(210) 555-1234"
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
