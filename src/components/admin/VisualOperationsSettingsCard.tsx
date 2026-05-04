import { useEffect, useMemo, useState } from "react";
import { Bot, Clock3, MessageSquareText, PhoneCall, ShieldCheck, SlidersHorizontal, TimerReset } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useCompanySettings, type CompanySettings } from "@/hooks/useCompanySettings";

function numberSetting(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolSetting(value: string | undefined, fallback = false) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function VisualSwitch({
  icon,
  title,
  description,
  checked,
  onChange,
  tone = "primary",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: "primary" | "amber" | "emerald";
}) {
  const activeClass =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10"
      : tone === "emerald"
        ? "border-emerald-500/40 bg-emerald-500/10"
        : "border-primary/40 bg-primary/10";

  return (
    <div className={`rounded-lg border p-3 transition-colors ${checked ? activeClass : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 text-muted-foreground">{icon}</div>
          <div className="min-w-0">
            <Label className="text-sm font-semibold">{title}</Label>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function VisualSlider({
  label,
  helper,
  value,
  min,
  max,
  step,
  suffix,
  onCommit,
}: {
  label: string;
  helper: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onCommit: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <Label className="text-sm font-semibold">{label}</Label>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{helper}</p>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono">
          {localValue}
          {suffix}
        </Badge>
      </div>
      <Slider
        value={[localValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => setLocalValue(next)}
        onValueCommit={([next]) => onCommit(next)}
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function VisualOperationsSettingsCard() {
  const { settings, isLoading, updateSettings } = useCompanySettings();

  const values = useMemo(() => ({
    humanReview: boolSetting(settings.human_in_the_loop, true),
    aiDrafts: boolSetting(settings.ai_sms_auto_draft, true),
    liveTranscription: boolSetting(settings.live_transcription_enabled, false),
    smsDelay: numberSetting(settings.sms_response_delay_seconds, 8),
    alertCap: numberSetting(settings.jarvis_max_daily_alerts, 50),
    techStall: numberSetting(settings.stall_threshold_tech_hours, 3),
    officeStall: numberSetting(settings.stall_threshold_office_hours, 24),
    customerStall: numberSetting(settings.stall_threshold_customer_hours, 48),
  }), [settings]);

  const save = (updates: Partial<CompanySettings>) => updateSettings.mutate(updates);

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Visual Operations Controls
        </CardTitle>
        <CardDescription className="text-xs">
          The high-impact switches and dials for how the system behaves day to day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <VisualSwitch
            icon={<ShieldCheck className="h-4 w-4" />}
            title={values.humanReview ? "Human review is on" : "JARVIS can act faster"}
            description={values.humanReview ? "Outbound AI work queues for a person to approve." : "Use this only when you are ready for more automation."}
            checked={values.humanReview}
            onChange={(checked) => save({ human_in_the_loop: checked ? "true" : "false" })}
            tone="amber"
          />
          <VisualSwitch
            icon={<MessageSquareText className="h-4 w-4" />}
            title="AI SMS drafts"
            description="Lets JARVIS draft customer replies from the conversation context."
            checked={values.aiDrafts}
            onChange={(checked) => save({ ai_sms_auto_draft: checked ? "true" : "false" })}
            tone="emerald"
          />
          <VisualSwitch
            icon={<PhoneCall className="h-4 w-4" />}
            title="Live transcription"
            description="Keeps call transcript context available for intake and NOW cards."
            checked={values.liveTranscription}
            onChange={(checked) => save({ live_transcription_enabled: checked ? "true" : "false" })}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <VisualSlider
            label="SMS typing delay"
            helper="How long JARVIS waits before sending a drafted auto-response."
            value={values.smsDelay}
            min={0}
            max={30}
            step={1}
            suffix="s"
            onCommit={(next) => save({ sms_response_delay_seconds: String(next) })}
          />
          <VisualSlider
            label="Daily JARVIS alert cap"
            helper="Stops approval alert texts from getting noisy on a busy day."
            value={values.alertCap}
            min={5}
            max={150}
            step={5}
            suffix=""
            onCommit={(next) => save({ jarvis_max_daily_alerts: String(next) })}
          />
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="mb-3 flex items-start gap-2">
            <TimerReset className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">When should JARVIS call something stuck?</p>
              <p className="text-xs text-muted-foreground">
                These dials control when Jarvis should raise his hand instead of letting work sit.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <VisualSlider
              label="Tech field work"
              helper="Waiting on technician updates, photos, checklist, or closeout."
              value={values.techStall}
              min={1}
              max={12}
              step={1}
              suffix="h"
              onCommit={(next) => save({ stall_threshold_tech_hours: String(next) })}
            />
            <VisualSlider
              label="Office work"
              helper="Waiting on review, invoice, warranty, rebate, permit, or inspection."
              value={values.officeStall}
              min={4}
              max={72}
              step={1}
              suffix="h"
              onCommit={(next) => save({ stall_threshold_office_hours: String(next) })}
            />
            <VisualSlider
              label="Customer response"
              helper="Waiting on approval, payment, info, or a reply."
              value={values.customerStall}
              min={12}
              max={168}
              step={4}
              suffix="h"
              onCommit={(next) => save({ stall_threshold_customer_hours: String(next) })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Bot className="h-4 w-4 text-primary" />
          <span>These settings are stored in the same company settings table the live functions read.</span>
          <Clock3 className="ml-auto h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
