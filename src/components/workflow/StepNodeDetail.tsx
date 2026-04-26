/**
 * StepNodeDetail — Draggable dialog window for editing a selected workflow step.
 * 4 tabs: Config, Execution, Forms (form steps only), Debug.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Save, Zap, Globe, SkipForward, ClipboardList, Users, BotMessageSquare,
  Eye, Pencil, X, Plus, Trash2, Settings2, HelpCircle, GripHorizontal,
  Bug, Terminal, AlertTriangle, Clock, ChevronLeft
} from "lucide-react";
import type { WorkflowStep, StepOwner, ActionLink } from "@/hooks/useWorkflowDefinitions";
import { OWNER_COLORS } from "@/lib/workflowIcons";
import { SectionFieldEditor } from "./SectionFieldEditor";
import { useLineItemTemplates } from "@/hooks/useLineItemTemplates";
import { useSmsTemplates } from "@/hooks/useSmsTemplates";
// useEmailTemplates removed — email system was ripped out
const useEmailTemplates = () => ({ data: [] as any[], isLoading: false });
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/* ── Edge function convention mapping ── */
const STEP_ACTION_TO_FUNCTION: Record<string, string> = {
  register_warranty: "auto-register-warranty",
  send_invoice: "invoicing-agent",
  request_review: "send-review-request",
  complete_follow_up: "auto-follow-up-text",
  submit_rebate: "send-rebate-email",
  schedule_inspection: "auto-apply-permit",
  send_confirmation: "send-job-reminders",
  dispatch: "send-job-reminders",
};

/* ── Form sections only shown for form-type steps ── */
const FORM_SECTION_OPTIONS = [
  { key: "pickup", label: "Pick Up System" },
  { key: "arrival", label: "Arrival / On-Site" },
  { key: "photos", label: "Photos" },
  { key: "specs", label: "Specs & Measurements" },
  { key: "diagnosis", label: "Diagnosis / Findings" },
  { key: "checklist", label: "Checklist Items" },
  { key: "conditions", label: "Conditions / Notes" },
  { key: "notes", label: "Tech Notes" },
  { key: "completion", label: "Completion" },
];

const FORM_STEP_ACTIONS = ["send_form", "send_completion_form", "send_install_checklist", "tech_form"];

/* ── Required field options ── */
const REQUIRED_FIELD_OPTIONS = [
  { key: "customer_phone", label: "Customer Phone" },
  { key: "customer_email", label: "Customer Email" },
  { key: "customer_name", label: "Customer Name" },
  { key: "scheduled_date", label: "Scheduled Date" },
  { key: "assigned_to", label: "Assigned To" },
  { key: "address", label: "Address" },
  { key: "brand", label: "Brand" },
  { key: "tech_phone", label: "Tech Phone" },
];

/* ── Inline Action Links Editor ── */
function ActionLinksEditor({ links, onChange }: { links: ActionLink[]; onChange: (v: ActionLink[]) => void }) {
  const addLink = () => onChange([...links, { label: "", url: "", type: "new_tab" }]);
  const removeLink = (i: number) => onChange(links.filter((_, idx) => idx !== i));
  const updateLink = (i: number, partial: Partial<ActionLink>) =>
    onChange(links.map((l, idx) => (idx === i ? { ...l, ...partial } : l)));

  return (
    <div className="space-y-2">
      {links.map((link, i) => (
        <div key={i} className="rounded-md border border-border p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              value={link.label}
              onChange={(e) => updateLink(i, { label: e.target.value })}
              placeholder="Button label"
              className="h-7 text-xs flex-1"
            />
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeLink(i)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <Input
            value={link.url}
            onChange={(e) => updateLink(i, { url: e.target.value })}
            placeholder="URL or {{token}}"
            className="h-7 text-xs font-mono"
          />
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full" onClick={addLink}>
        <Plus className="h-3 w-3" /> Add Link
      </Button>
    </div>
  );
}

/* ── Draggable hook for dialog ── */
function useDraggableDialog() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const reset = useCallback(() => setPos({ x: 0, y: 0 }), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: e.clientX - offset.current.x,
      y: e.clientY - offset.current.y,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { pos, reset, dragProps: { onPointerDown, onPointerMove, onPointerUp } };
}

interface Props {
  step: WorkflowStep | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: WorkflowStep) => void;
  jobType: string;
  initialSection?: string | null;
}

export function StepNodeDetail({ step, open, onClose, onSave, jobType, initialSection }: Props) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [formSections, setFormSections] = useState<string[]>([]);
  const [notesText, setNotesText] = useState("");
  const [owner, setOwner] = useState<StepOwner>("office");
  const [autoCompletable, setAutoCompletable] = useState(false);
  const [autoCompleteCondition, setAutoCompleteCondition] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [previewSection, setPreviewSection] = useState<string | null>(null);
  const [actionLinks, setActionLinks] = useState<ActionLink[]>([]);
  const [activeTab, setActiveTab] = useState("config");

  // Execution config state
  const [messageTemplate, setMessageTemplate] = useState("");
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [recipientType, setRecipientType] = useState<"customer" | "tech" | "owner">("customer");
  const [fallbackBehavior, setFallbackBehavior] = useState<"block_chain" | "escalate" | "stamp_and_log">("block_chain");
  const [schedulingMode, setSchedulingMode] = useState<"immediate" | "scheduled">("immediate");
  const [schedulingDays, setSchedulingDays] = useState(-1);
  const [schedulingTime, setSchedulingTime] = useState("08:00");

  const { pos, reset: resetDrag, dragProps } = useDraggableDialog();

  const isScheduleCreate = step?.primary_action === "schedule_or_create";
  const isFormStep = step ? FORM_STEP_ACTIONS.includes(step.primary_action) : false;
  const { data: allTemplates } = useLineItemTemplates();
  const { data: smsTemplates } = useSmsTemplates();
  const { data: emailTemplates } = useEmailTemplates();

  // Debug tab: recent workflow alerts for this step
  const { data: recentAlerts } = useQuery({
    queryKey: ["workflow_alerts", step?.id],
    queryFn: async () => {
      if (!step?.id) return [];
      const { data } = await supabase
        .from("workflow_alerts")
        .select("*")
        .eq("step_id", step.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!step?.id && activeTab === "debug",
  });

  const allMessageTemplates = useMemo(() => {
    const items: { slug: string; name: string; type: string }[] = [];
    for (const t of smsTemplates || []) {
      if (!(t as any).is_active) continue;
      const slug = (t as any).slug || (t as any).name?.toLowerCase().replace(/\s+/g, "_");
      items.push({ slug, name: `SMS: ${(t as any).name}`, type: "sms" });
    }
    for (const t of emailTemplates || []) {
      items.push({ slug: (t as any).slug || (t as any).name?.toLowerCase().replace(/\s+/g, "_"), name: `Email: ${(t as any).name}`, type: "email" });
    }
    return items;
  }, [smsTemplates, emailTemplates]);

  const templatesByJobType = useMemo(() => {
    if (!allTemplates) return {};
    const grouped: Record<string, typeof allTemplates> = {};
    for (const t of allTemplates) {
      for (const jt of t.auto_add_for || []) {
        if (!grouped[jt]) grouped[jt] = [];
        grouped[jt].push(t);
      }
    }
    return grouped;
  }, [allTemplates]);

  /* Reset local state when step changes */
  useEffect(() => {
    if (!step) return;
    setLabel(step.label);
    setDescription(step.description);
    setFormSections([...(step.form_sections || [])]);
    setNotesText((step.notes || []).join("\n"));
    setOwner(step.owner || "office");
    setAutoCompletable(!!step.auto_completable);
    setAutoCompleteCondition(step.auto_complete_condition || "");
    setActionLinks([...(step.action_links || [])]);
    setMessageTemplate(step.message_template || "");
    setRequiredFields([...(step.required_fields || [])]);
    setRecipientType(step.recipient_type || "customer");
    setFallbackBehavior(step.fallback_behavior || "block_chain");
    if (step.scheduling) {
      setSchedulingMode("scheduled");
      setSchedulingDays(step.scheduling.offset_days ?? -1);
      setSchedulingTime(step.scheduling.time ?? "08:00");
    } else {
      setSchedulingMode("immediate");
      setSchedulingDays(-1);
      setSchedulingTime("08:00");
    }
    setActiveTab("config");
    resetDrag();
  }, [step, resetDrag]);

  useEffect(() => {
    if (initialSection) {
      setPreviewSection(initialSection);
    }
  }, [initialSection]);

  if (!step) return null;

  const toggleSection = (key: string) => {
    setFormSections(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  const removeRequiredField = (field: string) => {
    setRequiredFields(prev => prev.filter(f => f !== field));
  };

  const addRequiredField = (field: string) => {
    if (!requiredFields.includes(field)) {
      setRequiredFields(prev => [...prev, field]);
    }
  };

  const handleSave = () => {
    onSave({
      ...step,
      label,
      description,
      automations: step.automations,
      form_sections: formSections.length > 0 ? formSections : undefined,
      notes: notesText.split("\n").filter(Boolean),
      owner,
      auto_completable: autoCompletable,
      auto_complete_condition: autoCompleteCondition || undefined,
      action_links: actionLinks.length > 0 ? actionLinks : undefined,
      message_template: messageTemplate || undefined,
      required_fields: requiredFields.length > 0 ? requiredFields : undefined,
      recipient_type: messageTemplate ? recipientType : undefined,
      fallback_behavior: fallbackBehavior !== "block_chain" ? fallbackBehavior : undefined,
      scheduling: schedulingMode === "scheduled" && messageTemplate
        ? { relative_to: "scheduled_date", offset_days: schedulingDays, time: schedulingTime }
        : undefined,
    });
    onClose();
  };

  const getPreviewUrl = (section?: string) => {
    const base = `/form/demo_${jobType}`;
    return section ? `${base}#section-${section}` : base;
  };

  const availableFields = REQUIRED_FIELD_OPTIONS.filter(f => !requiredFields.includes(f.key));
  const edgeFn = STEP_ACTION_TO_FUNCTION[step.primary_action] || null;

  /* Section field editor sub-view */
  if (expandedSection) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogPortal>
          <DialogOverlay />
          <div
            className="fixed z-50 bg-background border rounded-lg shadow-xl w-[520px] max-h-[80vh] overflow-hidden"
            style={{
              left: `calc(50% + ${pos.x}px)`,
              top: `calc(50% + ${pos.y}px)`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 cursor-grab select-none"
              {...dragProps}
            >
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedSection(null)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold flex-1">
                {FORM_SECTION_OPTIONS.find(s => s.key === expandedSection)?.label || expandedSection}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="p-4 max-h-[calc(80vh-52px)]">
              <p className="text-[10px] text-muted-foreground mb-3">
                Fields in this section for <span className="font-medium capitalize">{jobType}</span> jobs.
              </p>
              <SectionFieldEditor jobType={jobType} stepGroup={expandedSection} />
            </ScrollArea>
          </div>
        </DialogPortal>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogPortal>
          <DialogOverlay className="bg-black/40" />
          <div
            className="fixed z-50 bg-background border rounded-lg shadow-xl w-[540px] max-h-[85vh] flex flex-col overflow-hidden"
            style={{
              left: `calc(50% + ${pos.x}px)`,
              top: `calc(50% + ${pos.y}px)`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* ── Draggable title bar ── */}
            <div
              className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 cursor-grab select-none shrink-0"
              {...dragProps}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold flex-1 truncate">
                Step: {step.label}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* ── Tabs ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-4 mt-3 shrink-0">
                <TabsTrigger value="config" className="text-xs gap-1">
                  <Settings2 className="h-3 w-3" /> Config
                </TabsTrigger>
                <TabsTrigger value="execution" className="text-xs gap-1">
                  <Zap className="h-3 w-3" /> Execution
                </TabsTrigger>
                {isFormStep && (
                  <TabsTrigger value="forms" className="text-xs gap-1">
                    <ClipboardList className="h-3 w-3" /> Forms
                  </TabsTrigger>
                )}
                <TabsTrigger value="debug" className="text-xs gap-1">
                  <Bug className="h-3 w-3" /> Debug
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 min-h-0">
                {/* ═══════ TAB 1: CONFIG ═══════ */}
                <TabsContent value="config" className="px-4 pb-4 space-y-4 mt-0">
                  {/* Label + Description */}
                  <div className="space-y-2">
                    <Label className="text-xs">Label</Label>
                    <Input value={label} onChange={e => setLabel(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Description</Label>
                    <Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 text-sm" />
                  </div>

                  {/* Owner */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-blue-500" /> Responsible Party
                    </p>
                    <Select value={owner} onValueChange={(v) => setOwner(v as StepOwner)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(OWNER_COLORS) as [StepOwner, typeof OWNER_COLORS.office][]).map(([key, style]) => (
                          <SelectItem key={key} value={key}>
                            <span className={`${style.text} font-medium`}>{style.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Auto-Skip Condition */}
                  {step.skip_when && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 space-y-1">
                      <p className="text-xs font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                        <SkipForward className="h-3.5 w-3.5" /> Auto-Skip Condition
                      </p>
                      <p className="text-[11px] text-blue-600 dark:text-blue-400">
                        {step.skip_when.value !== undefined
                          ? `When ${step.skip_when.field} = ${String(step.skip_when.value)}`
                          : `When ${step.skip_when.field} ≠ ${step.skip_when.not_value}`}
                      </p>
                    </div>
                  )}

                  {/* Autopilot */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <BotMessageSquare className="h-3.5 w-3.5 text-violet-500" /> Autopilot
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={autoCompletable} onCheckedChange={setAutoCompletable} className="scale-75" />
                      <span className="text-xs text-muted-foreground">AI can auto-complete this step</span>
                    </label>
                    {autoCompletable && (
                      <Input
                        value={autoCompleteCondition}
                        onChange={e => setAutoCompleteCondition(e.target.value)}
                        placeholder="What triggers auto-completion?"
                        className="h-8 text-xs"
                      />
                    )}
                  </div>

                  {/* Automations — read-only badges */}
                  {step.automations && step.automations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-amber-500" /> Automations
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {step.automations.map(a => (
                          <Badge key={a} variant="secondary" className="text-[10px]">{a.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label className="text-xs">Notes (one per line)</Label>
                    <Textarea
                      value={notesText}
                      onChange={e => setNotesText(e.target.value)}
                      rows={3}
                      className="text-xs"
                      placeholder="Add operational notes…"
                    />
                  </div>
                </TabsContent>

                {/* ═══════ TAB 2: EXECUTION ═══════ */}
                <TabsContent value="execution" className="px-4 pb-4 space-y-4 mt-0">
                  {/* Message Template */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Message Template</Label>
                    <Select value={messageTemplate || "__none__"} onValueChange={(v) => setMessageTemplate(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="None — uses specialized handler" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {allMessageTemplates.map(t => (
                          <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Required Fields */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Required Before Firing</Label>
                    <div className="flex flex-wrap gap-1">
                      {requiredFields.map(f => {
                        const opt = REQUIRED_FIELD_OPTIONS.find(o => o.key === f);
                        return (
                          <Badge
                            key={f}
                            variant="secondary"
                            className="text-[10px] gap-1 pr-1 cursor-pointer hover:bg-destructive/20"
                            onClick={() => removeRequiredField(f)}
                          >
                            {opt?.label || f}
                            <X className="h-2.5 w-2.5" />
                          </Badge>
                        );
                      })}
                      {availableFields.length > 0 && (
                        <Select onValueChange={addRequiredField} value="">
                          <SelectTrigger className="h-6 w-6 p-0 border-dashed border-border rounded-full [&>svg]:hidden flex items-center justify-center">
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields.map(f => (
                              <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {requiredFields.length === 0 && (
                      <p className="text-[9px] text-muted-foreground italic">No pre-flight checks — step fires unconditionally</p>
                    )}
                  </div>

                  {/* Recipient */}
                  {messageTemplate && (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Send To</Label>
                      <ToggleGroup
                        type="single"
                        value={recipientType}
                        onValueChange={(v) => v && setRecipientType(v as any)}
                        className="justify-start"
                      >
                        <ToggleGroupItem value="customer" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Customer</ToggleGroupItem>
                        <ToggleGroupItem value="tech" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Tech</ToggleGroupItem>
                        <ToggleGroupItem value="owner" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Owner</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  )}

                  {/* Scheduling */}
                  {messageTemplate && (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">When to Send</Label>
                      <ToggleGroup
                        type="single"
                        value={schedulingMode}
                        onValueChange={(v) => v && setSchedulingMode(v as any)}
                        className="justify-start"
                      >
                        <ToggleGroupItem value="immediate" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Immediately</ToggleGroupItem>
                        <ToggleGroupItem value="scheduled" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Scheduled</ToggleGroupItem>
                      </ToggleGroup>
                      {schedulingMode === "scheduled" && (
                        <div className="flex gap-2 mt-1.5">
                          <div className="flex-1 space-y-0.5">
                            <Label className="text-[9px] text-muted-foreground">Days before scheduled_date</Label>
                            <Input type="number" value={schedulingDays} onChange={e => setSchedulingDays(Number(e.target.value))} className="h-7 text-xs" />
                          </div>
                          <div className="flex-1 space-y-0.5">
                            <Label className="text-[9px] text-muted-foreground">Time</Label>
                            <Input value={schedulingTime} onChange={e => setSchedulingTime(e.target.value)} placeholder="08:00" className="h-7 text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback Behavior */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      If Required Fields Missing
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-xs">
                            <p><strong>Block &amp; Alert</strong> stops the chain and notifies Jarvis.</p>
                            <p className="mt-1"><strong>Stamp &amp; Log</strong> marks complete and moves on.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <ToggleGroup
                      type="single"
                      value={fallbackBehavior === "escalate" ? "block_chain" : fallbackBehavior}
                      onValueChange={(v) => v && setFallbackBehavior(v as any)}
                      className="justify-start"
                    >
                      <ToggleGroupItem value="block_chain" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Block &amp; Alert</ToggleGroupItem>
                      <ToggleGroupItem value="stamp_and_log" className="h-7 px-3 text-[10px] rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Stamp &amp; Log</ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  {/* Action Links */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-orange-500" /> Action Links
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      URLs or tokens (e.g. {"{{warranty_portal}}"}, {"{{permit_portal}}"}) that open in a new tab.
                    </p>
                    <ActionLinksEditor links={actionLinks} onChange={setActionLinks} />
                  </div>

                  {/* Integrations */}
                  {step.integrations && step.integrations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-blue-500" /> Integrations
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {step.integrations.map(int => (
                          <Badge key={int} variant="secondary" className="text-[10px]">{int}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ═══════ TAB 3: FORMS (form steps only) ═══════ */}
                {isFormStep && (
                  <TabsContent value="forms" className="px-4 pb-4 space-y-4 mt-0">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5 text-emerald-500" /> Form Sections
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Toggle sections for this step. Preview to see the real form, Edit to manage fields.
                      </p>
                      <div className="space-y-1 pt-1">
                        {FORM_SECTION_OPTIONS.map(s => {
                          const isActive = formSections.includes(s.key);
                          return (
                            <div
                              key={s.key}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                                isActive ? "bg-emerald-500/10" : "hover:bg-muted/50"
                              }`}
                            >
                              <Checkbox checked={isActive} onCheckedChange={() => toggleSection(s.key)} className="h-3.5 w-3.5" />
                              <span className={`text-xs flex-1 ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                                {s.label}
                              </span>
                              {isActive && (
                                <div className="flex items-center gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => setPreviewSection(s.key)} title="Preview form">
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => setExpandedSection(s.key)} title="Edit fields">
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Auto Line Items */}
                    {isScheduleCreate && Object.keys(templatesByJobType).length > 0 && (
                      <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <ClipboardList className="h-3.5 w-3.5 text-primary" />
                          Auto Line Items by Job Type
                        </p>
                        {["service", "maintenance", "install", "estimate"].map(jt => {
                          const items = templatesByJobType[jt];
                          if (!items?.length) return null;
                          return (
                            <div key={jt} className="space-y-0.5">
                              <p className="text-[10px] font-medium capitalize text-muted-foreground">{jt}</p>
                              {items.map(t => {
                                const planNote = t.rules?.requires_plan_source
                                  ? t.rules.requires_plan_source === 'install_included'
                                    ? ' (included w/ install)'
                                    : ' (paid plan member)'
                                  : '';
                                return (
                                  <div key={t.id} className="flex items-center justify-between text-[10px] pl-2">
                                    <span className="text-foreground">{t.name}{planNote}</span>
                                    <span className="text-muted-foreground">${Number(t.base_price).toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                )}

                {/* ═══════ TAB 4: DEBUG ═══════ */}
                <TabsContent value="debug" className="px-4 pb-4 space-y-4 mt-0">
                  {/* Edge Function */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-emerald-500" /> Edge Function
                    </p>
                    <div className="rounded-md border border-border p-3 bg-muted/20">
                      <p className="text-xs font-mono">
                        {edgeFn ? (
                          <span className="text-emerald-600 dark:text-emerald-400">supabase/functions/{edgeFn}/index.ts</span>
                        ) : (
                          <span className="text-muted-foreground italic">Handled by workflow runner</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Primary action: <code className="text-foreground">{step.primary_action}</code>
                      </p>
                    </div>
                  </div>

                  {/* Step Metadata */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Settings2 className="h-3.5 w-3.5 text-blue-500" /> Step Metadata
                    </p>
                    <div className="rounded-md border border-border p-3 bg-muted/20 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Step ID</span>
                        <code className="text-foreground font-mono">{step.id}</code>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Sort Order</span>
                        <span className="text-foreground">{step.sort_order}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Timestamp Field</span>
                        <code className="text-foreground font-mono">{step.timestamp_field || "—"}</code>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Completion Check</span>
                        <span className="text-foreground">{step.completion_check || "timestamp"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Alerts */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Recent Alerts
                    </p>
                    {recentAlerts && recentAlerts.length > 0 ? (
                      <div className="space-y-1.5">
                        {recentAlerts.map((alert: any) => (
                          <div key={alert.id} className="rounded-md border border-border p-2 bg-muted/20 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <Badge
                                variant={alert.alert_type === "blocked" ? "destructive" : "secondary"}
                                className="text-[9px]"
                              >
                                {alert.alert_type}
                              </Badge>
                              <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {new Date(alert.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">{alert.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">No alerts logged for this step yet.</p>
                    )}
                  </div>

                  {/* Automations in debug view */}
                  {step.automations && step.automations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-amber-500" /> Automations
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {step.automations.map(a => (
                          <Badge key={a} variant="secondary" className="text-[10px]">{a.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>

              {/* ── Save button (always visible) ── */}
              <div className="px-4 py-3 border-t bg-muted/10 shrink-0">
                <Button onClick={handleSave} className="w-full gap-1.5">
                  <Save className="h-4 w-4" /> Save Step
                </Button>
              </div>
            </Tabs>
          </div>
        </DialogPortal>
      </Dialog>

      {/* Live Form Preview — full-screen drawer from right */}
      {previewSection && (
        <Sheet open={!!previewSection} onOpenChange={(v) => !v && setPreviewSection(null)}>
          <SheetContent className="w-full sm:w-[600px] p-0 overflow-hidden" side="right">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  Live Preview — {FORM_SECTION_OPTIONS.find(s => s.key === previewSection)?.label}
                </span>
                <Badge variant="outline" className="text-[9px] capitalize">{jobType}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setPreviewSection(null);
                    setExpandedSection(previewSection);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Edit Fields
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewSection(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="h-[calc(100%-52px)] bg-background">
              <iframe
                src={getPreviewUrl(previewSection)}
                className="w-full h-full border-0"
                title="Form Preview"
                style={{ maxWidth: "430px", margin: "0 auto", display: "block" }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
