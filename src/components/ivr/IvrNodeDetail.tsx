/**
 * IvrNodeDetail — Side panel (Sheet) for editing an IVR node's config.
 * Full editing for greeting, department, and read-only for terminal nodes.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Clock, Phone, PhoneForwarded, Users, MessageSquare, Voicemail, Check, GitBranch, UserCheck, UserPlus, Headset, AlertTriangle, PhoneMissed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SmsTemplatePicker, type SmsTemplateOption } from "@/components/SmsTemplatePicker";
import { TimePicker, DayPicker, AudioUploadField, DAYS } from "./IvrEditorComponents";
import type { IvrConfig, IvrMenuOption } from "@/hooks/useIvrConfig";

/** Textarea with local state + debounced auto-save. Shows a tiny ✓ on save. */
function DebouncedTextarea({ value, onSave, placeholder, className }: {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync from parent when the option changes (e.g. switching departments)
  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocal(v);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 600);
  };

  // Save on unmount if pending
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative">
      <Textarea
        value={local}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
      />
      {saved && (
        <span className="absolute top-1.5 right-2 flex items-center gap-1 text-[10px] text-primary animate-in fade-in">
          <Check className="h-3 w-3" /> Saved
        </span>
      )}
    </div>
  );
}

/** Input with local state + debounced auto-save. */
function DebouncedInput({ value, onSave, placeholder, className }: {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSave(v), 600);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return <Input value={local} onChange={handleChange} placeholder={placeholder} className={className} />;
}

interface IvrNodeDetailProps {
  nodeId: string;
  nodeType: string;
  onClose: () => void;
  config: IvrConfig;
  menuOption?: IvrMenuOption;
  profiles: { id: string; full_name: string }[];
  onUpdateConfig: (updates: Partial<IvrConfig>) => void;
  onUpdateDept: (updates: IvrMenuOptionUpdate, silent?: boolean) => void;
  onDeleteDept: (id: string) => void;
  postCallSettings?: { enabled: boolean; customerTemplate: string; customerTemplateKey: string; unknownTemplate: string; unknownTemplateKey: string };
  onUpdatePostCallSettings?: (updates: Record<string, string>) => void;
  missedCallSettings?: { enabled: boolean; duringHoursTemplate: string; duringHoursTemplateKey: string; afterHoursTemplate: string; afterHoursTemplateKey: string };
  onUpdateMissedCallSettings?: (updates: Record<string, string>) => void;
}

type IvrMenuOptionWithRoutingKey = IvrMenuOption & { routing_department_key?: string | null };
type IvrMenuOptionUpdate = Partial<IvrMenuOption> & { digit: string; routing_department_key?: string | null };

const ROUTING_DEPARTMENT_OPTIONS = [
  { value: "service", label: "Service" },
  { value: "sales", label: "Sales" },
  { value: "billing", label: "Billing" },
  { value: "general", label: "General" },
] as const;

function keyFromLegacyLabel(label: string | null | undefined): string {
  const l = (label || "").toLowerCase().trim();
  if (l.includes("sales")) return "sales";
  if (l.includes("service") || l.includes("repair") || l.includes("tech")) return "service";
  if (l.includes("bill") || l.includes("pay") || l.includes("invoic")) return "billing";
  return "general";
}

function routingDepartmentKeyForOption(option: IvrMenuOptionWithRoutingKey): string {
  const explicit = (option.routing_department_key || "").toLowerCase().trim();
  return ROUTING_DEPARTMENT_OPTIONS.some((routingOption) => routingOption.value === explicit)
    ? explicit
    : keyFromLegacyLabel(option.label);
}

function TemplateBindingCard({
  title,
  description,
  value,
  templateKey,
  placeholder,
  categoryFilter,
  onSaveText,
  onSelectTemplate,
}: {
  title: string;
  description?: string;
  value: string;
  templateKey?: string | null;
  placeholder: string;
  categoryFilter: string[];
  onSaveText: (value: string) => void;
  onSelectTemplate: (template: SmsTemplateOption) => void;
}) {
  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">{title}</Label>
          {description ? <p className="text-[10px] text-muted-foreground">{description}</p> : null}
        </div>
        <SmsTemplatePicker
          buttonVariant="outline"
          buttonLabel="Use template"
          categoryFilter={categoryFilter}
          align="end"
          onSelectTemplate={onSelectTemplate}
        />
      </div>
      {templateKey ? (
        <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-[10px] text-muted-foreground">
          Bound template: <span className="font-medium text-foreground">{templateKey}</span>
        </div>
      ) : null}
      <DebouncedTextarea
        value={value}
        onSave={onSaveText}
        className="text-sm min-h-[80px] bg-background"
        placeholder={placeholder}
      />
    </div>
  );
}

function GreetingEditor({ config, onUpdateConfig }: { config: IvrConfig; onUpdateConfig: (u: Partial<IvrConfig>) => void }) {
  return (
    <div className="space-y-4">
      <AudioUploadField
        label="Main Greeting"
        audioUrl={config.greeting_audio_url}
        textValue={config.greeting_text}
        onTextChange={(v) => onUpdateConfig({ greeting_text: v })}
        onAudioChange={(url) => onUpdateConfig({ greeting_audio_url: url })}
        placeholder="Thank you for calling…"
        bucketPath="main"
      />

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
          <div>
            <Label className="text-sm">Voicemail</Label>
            <p className="text-xs text-muted-foreground">Send unanswered calls to voicemail</p>
          </div>
          <Switch checked={config.voicemail_enabled} onCheckedChange={(v) => onUpdateConfig({ voicemail_enabled: v })} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Ring Timeout</Label>
            <Badge variant="outline" className="text-xs font-mono">{config.ring_timeout_seconds}s</Badge>
          </div>
          <Slider value={[config.ring_timeout_seconds]} onValueChange={([v]) => onUpdateConfig({ ring_timeout_seconds: v })} min={10} max={60} step={5} />
        </div>

        <Separator />

        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <Label className="text-xs font-semibold">Caller ID on forwarded calls</Label>
          <p className="text-[10px] text-muted-foreground">What number shows on your cell when calls are forwarded.</p>
          <div className="flex gap-2">
            <button onClick={() => onUpdateConfig({ after_hours_caller_id_mode: "company" })}
              className={`flex-1 p-3 rounded-lg border text-left transition-all ${config.after_hours_caller_id_mode !== "customer" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/50"}`}>
              <div className="text-sm font-medium">Company Number</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Your cell shows your work line.</p>
            </button>
            <button onClick={() => onUpdateConfig({ after_hours_caller_id_mode: "customer" })}
              className={`flex-1 p-3 rounded-lg border text-left transition-all ${config.after_hours_caller_id_mode === "customer" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/50"}`}>
              <div className="text-sm font-medium">Customer Number</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">See who's calling on your cell.</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DepartmentEditor({ option, onSave, onSaveSilent, onDelete, profiles }: {
  option: IvrMenuOptionWithRoutingKey;
  onSave: (updates: IvrMenuOptionUpdate) => void;
  onSaveSilent: (updates: IvrMenuOptionUpdate) => void;
  onDelete: () => void;
  profiles: { id: string; full_name: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Department Name</Label>
          <DebouncedInput value={option.label} onSave={(v) => onSaveSilent({ digit: option.digit, label: v })} className="text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={option.action_type} onValueChange={(v) => onSave({ digit: option.digit, action_type: v })}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="forward_client">Ring Assigned Team</SelectItem>
              <SelectItem value="forward_phone">Forward to Number</SelectItem>
              <SelectItem value="say_message">Play Message</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Routing Key</Label>
        <Select
          value={routingDepartmentKeyForOption(option)}
          onValueChange={(v) => onSave({ digit: option.digit, routing_department_key: v })}
        >
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROUTING_DEPARTMENT_OPTIONS.map((routingOption) => (
              <SelectItem key={routingOption.value} value={routingOption.value}>
                {routingOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {option.action_type !== "forward_client" && (
        <div className="space-y-1">
          <Label className="text-xs">{option.action_type === "say_message" ? "Message Text" : "Forward Number"}</Label>
          <DebouncedInput value={option.forward_to} onSave={(v) => onSaveSilent({ digit: option.digit, forward_to: v })} placeholder={option.action_type === "forward_phone" ? "+15551234567" : "Your message..."} className="text-sm" />
        </div>
      )}

      {option.action_type === "forward_client" && (
        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Users className="h-3 w-3" /> Assigned Team Members
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Choose which team members this department routes to. If none are selected, all available app clients can ring.
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {profiles.map((p) => {
              const assigned = option.assigned_user_ids || [];
              const isChecked = assigned.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      const next = checked ? [...assigned, p.id] : assigned.filter((uid) => uid !== p.id);
                      onSave({ digit: option.digit, assigned_user_ids: next });
                    }}
                  />
                  <span className="text-sm">{p.full_name}</span>
                </label>
              );
            })}
            {profiles.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2">No team members found</p>
            )}
          </div>
          {(option.assigned_user_ids?.length || 0) > 0 && (
            <div className="flex gap-1 flex-wrap pt-1">
              {option.assigned_user_ids!.map((uid) => {
                const p = profiles.find((pr) => pr.id === uid);
                return p ? <Badge key={uid} variant="secondary" className="text-[10px]">{p.full_name}</Badge> : null;
              })}
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Department Hours */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Department Hours</Label>
          <p className="text-xs text-muted-foreground">When this department is available to take calls</p>
        </div>
        <div className="space-y-3 pl-1">
          <div className="flex items-end gap-3">
            <TimePicker label="Opens" value={option.dept_hours_start || "08:00"}
              onChange={(v) => onSave({ digit: option.digit, dept_hours_start: v, dept_hours_end: option.dept_hours_end || "17:00", dept_business_days: option.dept_business_days || [1, 2, 3, 4, 5] })} />
            <span className="text-muted-foreground text-sm pb-2">to</span>
            <TimePicker label="Closes" value={option.dept_hours_end || "17:00"}
              onChange={(v) => onSave({ digit: option.digit, dept_hours_end: v, dept_hours_start: option.dept_hours_start || "08:00", dept_business_days: option.dept_business_days || [1, 2, 3, 4, 5] })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Open Days</Label>
            <DayPicker selected={option.dept_business_days || [1, 2, 3, 4, 5]}
              onChange={(days) => onSave({ digit: option.digit, dept_business_days: days, dept_hours_start: option.dept_hours_start || "08:00", dept_hours_end: option.dept_hours_end || "17:00" })} />
          </div>

          {(option.dept_business_days || []).includes(6) && (
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-3">
                <Switch checked={!!(option.dept_sat_hours_start && option.dept_sat_hours_end)}
                  onCheckedChange={(checked) => {
                    if (checked) onSave({ digit: option.digit, dept_sat_hours_start: "08:00", dept_sat_hours_end: "11:00" });
                    else onSave({ digit: option.digit, dept_sat_hours_start: null, dept_sat_hours_end: null });
                  }} />
                <div>
                  <Label className="text-sm">Saturday Hours</Label>
                  <p className="text-xs text-muted-foreground">Different hours on Saturdays</p>
                </div>
              </div>
              {option.dept_sat_hours_start && option.dept_sat_hours_end && (
                <div className="flex items-end gap-3 pl-1">
                  <TimePicker label="Sat Opens" value={option.dept_sat_hours_start} onChange={(v) => onSave({ digit: option.digit, dept_sat_hours_start: v })} />
                  <span className="text-muted-foreground text-sm pb-2">to</span>
                  <TimePicker label="Sat Closes" value={option.dept_sat_hours_end} onChange={(v) => onSave({ digit: option.digit, dept_sat_hours_end: v })} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Separator />

      <AudioUploadField
        label="Missed Call Voicemail (During Hours)"
        audioUrl={option.dept_vm_audio_url || null}
        textValue={option.dept_vm_greeting || ""}
        onTextChange={(v) => onSaveSilent({ digit: option.digit, dept_vm_greeting: v })}
        onAudioChange={(url) => onSave({ digit: option.digit, dept_vm_audio_url: url })}
        placeholder={`e.g. Hey! You've reached our ${option.label} team — we're here but stepped away. Leave a message and we'll call you right back!`}
        bucketPath={`dept-${option.digit}-vm`}
      />

      <AudioUploadField
        label="After-Hours Voicemail Greeting"
        audioUrl={option.dept_after_hours_audio_url || null}
        textValue={option.dept_after_hours_greeting || ""}
        onTextChange={(v) => onSaveSilent({ digit: option.digit, dept_after_hours_greeting: v })}
        onAudioChange={(url) => onSave({ digit: option.digit, dept_after_hours_audio_url: url })}
        placeholder={`e.g. You've reached our ${option.label} department after hours. Please leave a message after the tone.`}
        bucketPath={`dept-${option.digit}`}
      />

      <TemplateBindingCard
        title="After-Hours Auto-Reply SMS"
        description="Pick a governed template for this department, then keep the resolved body here as the legacy-safe preview/fallback."
        value={option.dept_after_hours_sms || ""}
        templateKey={option.dept_after_hours_sms_template_key}
        placeholder={`e.g. Thanks for calling ${option.label}. We're currently closed but will get back to you as soon as we can.`}
        categoryFilter={["ivr", "ivr_after_hours", "voice", "general"]}
        onSaveText={(v) => onSaveSilent({ digit: option.digit, dept_after_hours_sms: v })}
        onSelectTemplate={(template) => onSave({
          digit: option.digit,
          dept_after_hours_sms: template.template_body,
          dept_after_hours_sms_template_key: template.name,
        })}
      />

      <TemplateBindingCard
        title="Missed Call SMS (During Hours)"
        description="Use a department-specific governed template for missed live calls during open hours."
        value={option.dept_missed_call_sms || ""}
        templateKey={option.dept_missed_call_sms_template_key}
        placeholder="e.g. Sorry we missed your call! We're here and available — we'll call you right back."
        categoryFilter={["ivr", "ivr_missed_call", "voice", "general"]}
        onSaveText={(v) => onSaveSilent({ digit: option.digit, dept_missed_call_sms: v })}
        onSelectTemplate={(template) => onSave({
          digit: option.digit,
          dept_missed_call_sms: template.template_body,
          dept_missed_call_sms_template_key: template.name,
        })}
      />

      <Separator />

      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        Delete Department
      </Button>
    </div>
  );
}

/** ── 24/7 Answering Service Overflow Editor ── */
function OverflowEditor({ config, onUpdateConfig }: { config: IvrConfig; onUpdateConfig: (u: Partial<IvrConfig>) => void }) {
  const enabled = !!config.answering_service_enabled;
  const number = config.answering_service_number || "";
  const label = config.answering_service_label || "Answering Service";
  const ringSeconds = config.overflow_ring_seconds_before_handoff ?? 20;

  return (
    <div className="space-y-4">
      {/* Hero summary */}
      <div className="rounded-lg border border-cyan-300/40 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Headset className="h-5 w-5 text-cyan-600" />
          <div className="flex-1">
            <p className="text-sm font-bold">24/7 Live Answering Service</p>
            <p className="text-[11px] text-muted-foreground">
              Always-on safety net. Live humans catch every call you can't.
            </p>
          </div>
          <Badge variant={enabled ? "default" : "outline"} className={enabled ? "bg-cyan-600" : ""}>
            {enabled ? "Active" : "Off"}
          </Badge>
        </div>
        {enabled && number && (
          <p className="text-[11px] text-muted-foreground pt-1 border-t border-cyan-300/20">
            Routing to <span className="font-mono font-semibold">{number}</span>
          </p>
        )}
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
        <div>
          <Label className="text-sm font-semibold">Enable Overflow</Label>
          <p className="text-[11px] text-muted-foreground">Master switch for all answering service routing</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onUpdateConfig({ answering_service_enabled: v })}
        />
      </div>

      <div className={`space-y-4 transition-opacity ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
        {/* Number + Label */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Answering Service Number</Label>
            <DebouncedInput
              value={number}
              onSave={(v) => onUpdateConfig({ answering_service_number: v })}
              placeholder="+12106378332"
              className="text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">E.164 format with country code (e.g. +12106378332)</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Display Label</Label>
            <DebouncedInput
              value={label}
              onSave={(v) => onUpdateConfig({ answering_service_label: v })}
              placeholder="MAP Communications"
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Shown on call logs and dispatcher badges</p>
          </div>
        </div>

        <Separator />

        {/* Trigger toggles */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">When to send calls to overflow</Label>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-cyan-600 mt-0.5" />
              <div>
                <Label className="text-sm">When line is busy</Label>
                <p className="text-[10px] text-muted-foreground">Tech is on another call</p>
              </div>
            </div>
            <Switch
              checked={!!config.overflow_on_busy}
              onCheckedChange={(v) => onUpdateConfig({ overflow_on_busy: v })}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-cyan-600 mt-0.5" />
              <div>
                <Label className="text-sm">When no one answers</Label>
                <p className="text-[10px] text-muted-foreground">After ring timeout below</p>
              </div>
            </div>
            <Switch
              checked={!!config.overflow_on_no_answer}
              onCheckedChange={(v) => onUpdateConfig({ overflow_on_no_answer: v })}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-2">
              <Voicemail className="h-4 w-4 text-cyan-600 mt-0.5" />
              <div>
                <Label className="text-sm">After-hours / closed</Label>
                <p className="text-[10px] text-muted-foreground">Live human instead of voicemail</p>
              </div>
            </div>
            <Switch
              checked={!!config.overflow_after_hours}
              onCheckedChange={(v) => onUpdateConfig({ overflow_after_hours: v })}
            />
          </div>
        </div>

        <Separator />

        {/* Ring time slider */}
        <div className="space-y-3 p-3 rounded-lg bg-cyan-500/5 border border-cyan-300/30">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Ring time before handoff</Label>
            <Badge variant="outline" className="text-xs font-mono border-cyan-400 text-cyan-700">{ringSeconds}s</Badge>
          </div>
          <Slider
            value={[ringSeconds]}
            onValueChange={([v]) => onUpdateConfig({ overflow_ring_seconds_before_handoff: v })}
            min={5}
            max={45}
            step={1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>5s — fast handoff</span>
            <span>45s — let it ring</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Shorter = caller never waits, hits live agent fast. Longer = team has more time to grab it.
          </p>
        </div>

        {/* After-hours skip VM */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
          <div>
            <Label className="text-sm">Skip voicemail after-hours</Label>
            <p className="text-[10px] text-muted-foreground">Send straight to overflow instead of recording</p>
          </div>
          <Switch
            checked={!!config.overflow_after_hours_skip_voicemail}
            onCheckedChange={(v) => onUpdateConfig({ overflow_after_hours_skip_voicemail: v })}
          />
        </div>

        {!number && enabled && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Add an answering service number above to activate routing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HoldMusicEditor({ config, onUpdateConfig }: { config: IvrConfig; onUpdateConfig: (u: Partial<IvrConfig>) => void }) {
  const handoffSeconds = config.overflow_ring_seconds_before_handoff ?? config.ring_timeout_seconds ?? 15;
  const overflowLabel = config.answering_service_label || "Answering Service";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
        <p className="text-sm font-semibold">Hold Queue</p>
        <p className="text-xs text-muted-foreground">
          When everyone on the department is already on live calls, the new caller waits here with queue audio.
          If nobody becomes free within {handoffSeconds} seconds, the call moves straight to {overflowLabel}.
        </p>
      </div>

      <AudioUploadField
        label="Queue Audio"
        audioUrl={config.hold_music_audio_url}
        textValue=""
        onTextChange={() => {}}
        onAudioChange={(url) => onUpdateConfig({ hold_music_audio_url: url })}
        placeholder="Upload an MP3/WAV for callers to hear while queued."
        bucketPath="hold-music"
        allowTextInput={false}
      />

      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5">
        <Label className="text-xs font-semibold">Current queue window</Label>
        <p className="text-xs text-muted-foreground">
          Queue before handoff: <span className="font-mono">{handoffSeconds}s</span>
        </p>
        <p className="text-[10px] text-muted-foreground">
          Adjust the exact delay in the <strong>24/7 Answering Service</strong> block.
        </p>
      </div>
    </div>
  );
}

export function IvrNodeDetail({ nodeId, nodeType, onClose, config, menuOption, profiles, onUpdateConfig, onUpdateDept, onDeleteDept, postCallSettings, onUpdatePostCallSettings, missedCallSettings, onUpdateMissedCallSettings }: IvrNodeDetailProps) {
  const handleSilentSave = useCallback((updates: IvrMenuOptionUpdate) => {
    onUpdateDept(updates, true);
  }, [onUpdateDept]);

  const isAfterHoursSms = nodeId.startsWith("sms-ah-");

  const nodeTitle = nodeType === "greeting" ? "Greeting & Settings"
    : nodeType === "department" ? (menuOption?.label || "Department")
    : nodeType === "holiday" ? "Holiday Check"
    : nodeType === "no_answer" ? "No Answer"
    : nodeType === "voicemail" ? "Voicemail"
    : nodeType === "after_hours" ? "After Hours"
    : nodeType === "hangup" ? "Hangup"
    : nodeType === "sms" ? (isAfterHoursSms ? "After-Hours SMS" : "Missed Call SMS")
    : nodeType === "post_call_check" ? "Post-Call Auto SMS"
    : nodeType === "post_call_customer" ? "Customer Thank You SMS"
    : nodeType === "post_call_unknown" ? "New Caller Intake SMS"
    : nodeType === "overflow" ? "24/7 Answering Service"
    : nodeType === "hold_music" ? "Hold Queue"
    : nodeType === "missed_call_master" ? "Universal Missed-Call SMS"
    : "Incoming Call";

  return (
    <div className="w-96 border-l bg-card flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{nodeTitle}</p>
          <Badge variant="outline" className="text-[10px] mt-1">{nodeType}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {nodeType === "greeting" && (
          <GreetingEditor config={config} onUpdateConfig={onUpdateConfig} />
        )}

        {nodeType === "overflow" && (
          <OverflowEditor config={config} onUpdateConfig={onUpdateConfig} />
        )}

        {nodeType === "hold_music" && (
          <HoldMusicEditor config={config} onUpdateConfig={onUpdateConfig} />
        )}

        {nodeType === "department" && menuOption && (
          <DepartmentEditor
            option={menuOption}
            onSave={onUpdateDept}
            onSaveSilent={handleSilentSave}
            onDelete={() => onDeleteDept(menuOption.id)}
            profiles={profiles}
          />
        )}

        {nodeType === "holiday" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Automatically detects major US holidays (New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas Eve & Day).
            </p>
            <p className="text-xs text-muted-foreground">
              On holidays, callers hear the holiday greeting and go to voicemail.
            </p>
          </div>
        )}

        {nodeType === "incoming" && (
          <p className="text-sm text-muted-foreground">
            This is the entry point — calls arrive at your Twilio number and enter the IVR flow.
          </p>
        )}

        {nodeType === "voicemail" && nodeId === "holiday-vm" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Callers hear this greeting on holidays before leaving a voicemail.
            </p>
            <Separator />
            <AudioUploadField
              label="Holiday Voicemail Greeting"
              audioUrl={config.voicemail_audio_url}
              textValue={config.voicemail_greeting}
              onTextChange={(v) => onUpdateConfig({ voicemail_greeting: v })}
              onAudioChange={(url) => onUpdateConfig({ voicemail_audio_url: url })}
              placeholder="e.g. Happy Holidays from Carnes & Sons! We're closed today — leave a message and we'll call you back first thing."
              bucketPath="holiday-vm"
            />
          </div>
        )}

        {(nodeType === "voicemail" && nodeId !== "holiday-vm") && (
          <p className="text-sm text-muted-foreground">
            Callers can optionally leave a voicemail. The missed call SMS fires regardless — voicemail is not required for the SMS to send.
          </p>
        )}

        {nodeType === "no_answer" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              When a department rings and nobody answers within the ring timeout, two things happen simultaneously:
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50">
                <MessageSquare className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">Missed Call SMS</p>
                  <p className="text-[10px] text-muted-foreground">Fires immediately — no voicemail required</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <Voicemail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">Voicemail Prompt</p>
                  <p className="text-[10px] text-muted-foreground">Caller may or may not leave a message</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {(nodeType === "hangup" || nodeType === "after_hours") && (
          <p className="text-sm text-muted-foreground">
            {nodeType === "hangup" && "Call disconnects after two failed menu input attempts."}
            {nodeType === "after_hours" && "Plays the department's after-hours greeting when calling outside business hours."}
          </p>
        )}

        {nodeType === "sms" && menuOption && (() => {
          const enabledField = isAfterHoursSms ? "dept_after_hours_sms_enabled" : "dept_missed_call_sms_enabled";
          const isEnabled = menuOption[enabledField] !== false;
          const noVmEnabled = menuOption.dept_no_vm_missed_call_sms_enabled !== false;
          const postCallEnabled = menuOption.dept_post_call_sms_enabled === true;
          return (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isAfterHoursSms
                  ? "Auto-sends an SMS to callers who reach voicemail outside business hours."
                  : "Auto-sends an SMS to callers who miss you during business hours."}
              </p>
              <Separator />
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                <div>
                  <Label className="text-sm">{isAfterHoursSms ? "Enable After-Hours SMS" : "Enable Missed Call SMS"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {isAfterHoursSms ? "Auto-text callers outside business hours" : "Auto-text callers when you miss their call"}
                  </p>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(v) => onUpdateDept({ digit: menuOption.digit, [enabledField]: v }, true)}
                />
              </div>
              <div className={`space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50 transition-opacity ${!isEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                <TemplateBindingCard
                  title={isAfterHoursSms ? "After-Hours SMS Template" : "Missed Call SMS Template (after voicemail prompt)"}
                  description={isAfterHoursSms ? "Template-governed after-hours auto reply for this department." : "Template-governed missed-call auto reply for this department."}
                  value={isAfterHoursSms ? (menuOption.dept_after_hours_sms || "") : (menuOption.dept_missed_call_sms || "")}
                  templateKey={isAfterHoursSms ? menuOption.dept_after_hours_sms_template_key : menuOption.dept_missed_call_sms_template_key}
                  placeholder={isAfterHoursSms
                    ? `e.g. Thanks for calling ${menuOption.label}. We're currently closed but will get back to you first thing tomorrow.`
                    : `e.g. Sorry we missed your call! We're here and available — we'll call you right back.`}
                  categoryFilter={isAfterHoursSms ? ["ivr", "ivr_after_hours", "voice", "general"] : ["ivr", "ivr_missed_call", "voice", "general"]}
                  onSaveText={(v) => {
                    const field = isAfterHoursSms ? "dept_after_hours_sms" : "dept_missed_call_sms";
                    onUpdateDept({ digit: menuOption.digit, [field]: v }, true);
                  }}
                  onSelectTemplate={(template) => {
                    const bodyField = isAfterHoursSms ? "dept_after_hours_sms" : "dept_missed_call_sms";
                    const keyField = isAfterHoursSms ? "dept_after_hours_sms_template_key" : "dept_missed_call_sms_template_key";
                    onUpdateDept({
                      digit: menuOption.digit,
                      [bodyField]: template.template_body,
                      [keyField]: template.name,
                    }, true);
                  }}
                />
              </div>

              {!isAfterHoursSms && (
                <>
                  <Separator />
                  <div className="rounded-lg border border-rose-300/40 bg-rose-500/5 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-semibold">No-Voicemail Missed Call SMS</Label>
                        <p className="text-[11px] text-muted-foreground">Sent when caller hangs up without leaving a voicemail (covers direct dials too)</p>
                      </div>
                      <Switch
                        checked={noVmEnabled}
                        onCheckedChange={(v) => onUpdateDept({ digit: menuOption.digit, dept_no_vm_missed_call_sms_enabled: v }, true)}
                      />
                    </div>
                    <div className={`transition-opacity ${!noVmEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                      <TemplateBindingCard
                        title="No-VM Missed Call Body"
                        description="Single source of truth — replaces the legacy global missed-call SMS settings."
                        value={menuOption.dept_no_vm_missed_call_sms || ""}
                        templateKey={null}
                        placeholder="Hi! Sorry we missed you — we'll call you right back. Need us sooner? Just text us here."
                        categoryFilter={["ivr", "missed_call", "voice", "general"]}
                        onSaveText={(v) => onUpdateDept({ digit: menuOption.digit, dept_no_vm_missed_call_sms: v }, true)}
                        onSelectTemplate={(t) => onUpdateDept({ digit: menuOption.digit, dept_no_vm_missed_call_sms: t.template_body }, true)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/5 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-semibold">Post-Call Thank-You SMS</Label>
                        <p className="text-[11px] text-muted-foreground">Sent after a completed call to this dept (1x/day per caller)</p>
                      </div>
                      <Switch
                        checked={postCallEnabled}
                        onCheckedChange={(v) => onUpdateDept({ digit: menuOption.digit, dept_post_call_sms_enabled: v }, true)}
                      />
                    </div>
                    <div className={`transition-opacity ${!postCallEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                      <TemplateBindingCard
                        title="Post-Call Body"
                        description="Single source of truth — replaces the legacy global post-call SMS settings."
                        value={menuOption.dept_post_call_sms || ""}
                        templateKey={null}
                        placeholder="Hey! Thanks so much for calling — we really appreciate you! Text us back here anytime. 😊"
                        categoryFilter={["ivr", "post_call", "voice", "general"]}
                        onSaveText={(v) => onUpdateDept({ digit: menuOption.digit, dept_post_call_sms: v }, true)}
                        onSelectTemplate={(t) => onUpdateDept({ digit: menuOption.digit, dept_post_call_sms: t.template_body }, true)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {nodeType === "sms" && !menuOption && (
          <p className="text-sm text-muted-foreground">
            Auto-sends an SMS to callers who reach voicemail.
          </p>
        )}

        {nodeType === "post_call_check" && postCallSettings && onUpdatePostCallSettings && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              After any completed inbound call, automatically texts the caller once per day — with different messages for existing customers vs. new callers.
            </p>
            <Separator />
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <Label className="text-sm">Enable Post-Call SMS</Label>
                <p className="text-xs text-muted-foreground">Send auto-SMS after every completed call</p>
              </div>
              <Switch
                checked={postCallSettings.enabled}
                onCheckedChange={(v) => onUpdatePostCallSettings({ post_call_sms_enabled: v ? "true" : "false" })}
              />
            </div>
            <div className="space-y-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <TemplateBindingCard
                title="Customer Template"
                description="Used for recognized customers after a completed call."
                value={postCallSettings.customerTemplate}
                templateKey={postCallSettings.customerTemplateKey}
                placeholder="Hey! Thanks so much for calling — we really appreciate you! If there's anything else you need, just text us back here anytime. 😊"
                categoryFilter={["ivr", "post_call", "voice", "general"]}
                onSaveText={(v) => onUpdatePostCallSettings({ post_call_sms_customer: v })}
                onSelectTemplate={(template) => onUpdatePostCallSettings({
                  post_call_sms_customer: template.template_body,
                  post_call_sms_customer_template_key: template.name,
                })}
              />
            </div>
            <div className="space-y-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <TemplateBindingCard
                title="New Caller Template"
                description="Used for unknown callers so you can continue intake by text."
                value={postCallSettings.unknownTemplate}
                templateKey={postCallSettings.unknownTemplateKey}
                placeholder="Hey! Thanks so much for calling — we really appreciate you! If there's anything else you need, just text us back here anytime. 😊"
                categoryFilter={["ivr", "post_call", "voice", "general"]}
                onSaveText={(v) => onUpdatePostCallSettings({ post_call_sms_unknown: v })}
                onSelectTemplate={(template) => onUpdatePostCallSettings({
                  post_call_sms_unknown: template.template_body,
                  post_call_sms_unknown_template_key: template.name,
                })}
              />
            </div>
          </div>
        )}

        {nodeType === "post_call_customer" && postCallSettings && onUpdatePostCallSettings && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sent to callers we recognize as existing customers. Warm, appreciative tone — no info gathering needed.
            </p>
            <Separator />
            <div className="space-y-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <TemplateBindingCard
                title="Thank You SMS Template"
                description="Recognized-customer post-call message."
                value={postCallSettings.customerTemplate}
                templateKey={postCallSettings.customerTemplateKey}
                placeholder="Hey! Thanks so much for calling — we really appreciate you! If there's anything else you need, just text us back here anytime. 😊"
                categoryFilter={["ivr", "post_call", "voice", "general"]}
                onSaveText={(v) => onUpdatePostCallSettings({ post_call_sms_customer: v })}
                onSelectTemplate={(template) => onUpdatePostCallSettings({
                  post_call_sms_customer: template.template_body,
                  post_call_sms_customer_template_key: template.name,
                })}
              />
            </div>
          </div>
        )}

        {nodeType === "post_call_unknown" && postCallSettings && onUpdatePostCallSettings && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sent to new callers we don't have on file. Asks for their info so you can follow up with estimates & invoices.
            </p>
            <Separator />
            <div className="space-y-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <TemplateBindingCard
                title="Intake SMS Template"
                description="Unknown-caller follow-up after a completed call."
                value={postCallSettings.unknownTemplate}
                templateKey={postCallSettings.unknownTemplateKey}
                placeholder="Hey! Thanks so much for calling — we really appreciate you! If there's anything else you need, just text us back here anytime. 😊"
                categoryFilter={["ivr", "post_call", "voice", "general"]}
                onSaveText={(v) => onUpdatePostCallSettings({ post_call_sms_unknown: v })}
                onSelectTemplate={(template) => onUpdatePostCallSettings({
                  post_call_sms_unknown: template.template_body,
                  post_call_sms_unknown_template_key: template.name,
                })}
              />
            </div>
          </div>
        )}

        {nodeType === "missed_call_master" && missedCallSettings && onUpdateMissedCallSettings && (
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-300/40 bg-gradient-to-br from-rose-500/10 to-rose-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <PhoneMissed className="h-5 w-5 text-rose-600" />
                <div className="flex-1">
                  <p className="text-sm font-bold">Universal Missed-Call SMS</p>
                  <p className="text-[11px] text-muted-foreground">Auto-replies to ALL unanswered inbound calls — even direct dials that bypass the menu.</p>
                </div>
                <Badge variant={missedCallSettings.enabled ? "default" : "outline"} className={missedCallSettings.enabled ? "bg-rose-600" : ""}>
                  {missedCallSettings.enabled ? "Active" : "Off"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-rose-300/20">
                Skipped when: suspected bot, answering service handled it, or another SMS was sent in the last 30 min.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <Label className="text-sm font-semibold">Enable Universal SMS</Label>
                <p className="text-[11px] text-muted-foreground">Master switch — turns on missed-call auto-replies for every unanswered call</p>
              </div>
              <Switch
                checked={missedCallSettings.enabled}
                onCheckedChange={(v) => onUpdateMissedCallSettings({ missed_call_sms_enabled: v ? "true" : "false" })}
              />
            </div>

            <div className={`space-y-4 transition-opacity ${!missedCallSettings.enabled ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="space-y-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <TemplateBindingCard
                  title="During Business Hours"
                  description="Sent when a live inbound call is missed while your office is open."
                  value={missedCallSettings.duringHoursTemplate}
                  templateKey={missedCallSettings.duringHoursTemplateKey}
                  placeholder="Hi! Sorry we missed you — we'll call you right back. Need us sooner? Just text us here."
                  categoryFilter={["ivr", "missed_call", "voice", "general"]}
                  onSaveText={(v) => onUpdateMissedCallSettings({ missed_call_sms_during_hours: v })}
                  onSelectTemplate={(template) => onUpdateMissedCallSettings({
                    missed_call_sms_during_hours: template.template_body,
                    missed_call_sms_during_hours_template_key: template.name,
                  })}
                />
                <p className="text-[10px] text-muted-foreground">Sent when caller misses you during open hours.</p>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                <TemplateBindingCard
                  title="After Hours / Closed"
                  description="Sent when the missed call lands outside your configured business hours." 
                  value={missedCallSettings.afterHoursTemplate}
                  templateKey={missedCallSettings.afterHoursTemplateKey}
                  placeholder="Hi! Thanks for calling — we're closed right now. We'll get back to you first thing. For emergencies, just text EMERGENCY here."
                  categoryFilter={["ivr", "after_hours", "missed_call", "voice", "general"]}
                  onSaveText={(v) => onUpdateMissedCallSettings({ missed_call_sms_after_hours: v })}
                  onSelectTemplate={(template) => onUpdateMissedCallSettings({
                    missed_call_sms_after_hours: template.template_body,
                    missed_call_sms_after_hours_template_key: template.name,
                  })}
                />
                <p className="text-[10px] text-muted-foreground">Sent outside business hours / on closed days.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
