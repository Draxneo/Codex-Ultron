import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, Bot, CalendarCheck, ExternalLink, FileText, Plus, Save, Trash2, Wrench, Zap } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ESTIMATE_WORKFLOW,
  INSTALL_WORKFLOW,
  LEAD_DRIP_WORKFLOW,
  SERVICE_WORKFLOW,
  UNIVERSAL_TECH_WORKFLOW,
  type WorkflowActionLink,
  type WorkflowOwner,
  type WorkflowStepDefinition,
  type WorkflowType,
} from "@/lib/workflowNow";
import { cn } from "@/lib/utils";

const OWNER_LABEL: Record<WorkflowOwner, string> = {
  office: "Office",
  tech: "Tech",
  customer: "Customer",
  system: "System",
};

const WORKFLOW_TABS: { id: WorkflowType; label: string; icon: React.ElementType; fallback: WorkflowStepDefinition[] }[] = [
  { id: "estimate", label: "Estimate", icon: FileText, fallback: ESTIMATE_WORKFLOW },
  { id: "install", label: "Install", icon: Wrench, fallback: INSTALL_WORKFLOW },
  { id: "service", label: "Service", icon: CalendarCheck, fallback: SERVICE_WORKFLOW },
  { id: "lead", label: "Lead Drip", icon: Bot, fallback: LEAD_DRIP_WORKFLOW },
];

function modeTone(mode?: WorkflowStepDefinition["mode"]) {
  if (mode === "autopilot") return "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200";
  if (mode === "auto") return "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
  if (mode === "skippable") return "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
  return "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function ownerTone(owner: WorkflowOwner) {
  if (owner === "office") return "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
  if (owner === "tech") return "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
  if (owner === "customer") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  return "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function parseSteps(value: unknown): WorkflowStepDefinition[] {
  if (Array.isArray(value)) return value as WorkflowStepDefinition[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function csv(value?: string[]) {
  return (value || []).join(", ");
}

function fromCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeStep(step: WorkflowStepDefinition): WorkflowStepDefinition {
  const title = step.title || step.label || "Untitled workflow step";
  return {
    ...step,
    key: step.key || title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    title,
    label: title,
    owner: step.owner || "office",
    mode: step.mode || "manual",
    formSections: step.formSections || [],
    requiredContext: step.requiredContext || [],
    actionLinks: step.actionLinks || [],
  };
}

function newStep(index: number): WorkflowStepDefinition {
  return {
    key: `new_step_${index + 1}`,
    title: "New workflow step",
    owner: "office",
    mode: "manual",
    formSections: [],
    requiredContext: [],
    actionLinks: [],
  };
}

function newLink(): WorkflowActionLink {
  return {
    label: "Open link",
    url: "https://",
    kind: "reference",
    when: "When this step needs a supporting portal",
    brandIncludes: [],
  };
}

function useWorkflowDefinitions() {
  return useQuery({
    queryKey: ["workflow-definitions-editor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_definitions" as any)
        .select("job_type, steps")
        .eq("is_active", true);
      if (error) throw error;
      return ((data || []) as any[]).reduce((acc, row) => {
        const parsed = parseSteps(row.steps);
        if (parsed.length) acc[row.job_type as WorkflowType] = parsed.map(normalizeStep);
        return acc;
      }, {} as Partial<Record<WorkflowType, WorkflowStepDefinition[]>>);
    },
  });
}

function StepEditor({
  step,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  step: WorkflowStepDefinition;
  index: number;
  total: number;
  onChange: (step: WorkflowStepDefinition) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const update = (patch: Partial<WorkflowStepDefinition>) => onChange(normalizeStep({ ...step, ...patch }));
  const links = step.actionLinks || [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b bg-muted/25">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {index + 1}
            </span>
            <div className="min-w-0 space-y-2">
              <Input value={step.title} onChange={(event) => update({ title: event.target.value, label: event.target.value })} className="h-10 text-base font-semibold" />
              <div className="grid gap-2 md:grid-cols-[1fr_160px_160px]">
                <Input value={step.key} onChange={(event) => update({ key: event.target.value })} placeholder="step_key" />
                <select
                  value={step.owner}
                  onChange={(event) => update({ owner: event.target.value as WorkflowOwner })}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  {Object.keys(OWNER_LABEL).map((owner) => <option key={owner} value={owner}>{OWNER_LABEL[owner as WorkflowOwner]}</option>)}
                </select>
                <select
                  value={step.mode || "manual"}
                  onChange={(event) => update({ mode: event.target.value as WorkflowStepDefinition["mode"] })}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                  <option value="autopilot">Autopilot</option>
                  <option value="skippable">Skippable</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon" disabled={index === 0} onClick={() => onMove(-1)} title="Move step up">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={index === total - 1} onClick={() => onMove(1)} title="Move step down">
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onDelete} title="Delete step">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={ownerTone(step.owner)}>{OWNER_LABEL[step.owner]}</Badge>
          <Badge variant="outline" className={modeTone(step.mode)}>{step.mode || "manual"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What this step means</p>
            <Textarea value={step.description || ""} onChange={(event) => update({ description: event.target.value })} placeholder="Plain-English explanation for humans." />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jarvis instructions</p>
            <Textarea value={step.jarvisInstructions || ""} onChange={(event) => update({ jarvisInstructions: event.target.value })} placeholder="What Jarvis should inspect, infer, or avoid guessing." />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required context</p>
            <Input value={csv(step.requiredContext)} onChange={(event) => update({ requiredContext: fromCsv(event.target.value) })} placeholder="brand, jurisdiction, permit portal URL" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form sections / chips</p>
            <Input value={csv(step.formSections)} onChange={(event) => update({ formSections: fromCsv(event.target.value) })} placeholder="Photos, Specs, Notes" />
          </div>
        </div>
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Context action links</p>
              <p className="text-xs text-muted-foreground">These are the buttons Jarvis can attach to Now cards when the step has enough context.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => update({ actionLinks: [...links, newLink()] })}>
              <Plus className="mr-2 h-4 w-4" />
              Add link
            </Button>
          </div>
          {links.length === 0 ? (
            <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">No contextual links on this step yet.</p>
          ) : (
            <div className="space-y-2">
              {links.map((link, linkIndex) => (
                <div key={linkIndex} className="grid gap-2 rounded-md border bg-background p-3 xl:grid-cols-[160px_1fr_220px_190px_auto]">
                  <Input
                    value={link.label}
                    onChange={(event) => {
                      const next = [...links];
                      next[linkIndex] = { ...link, label: event.target.value };
                      update({ actionLinks: next });
                    }}
                    placeholder="Button label"
                  />
                  <Input
                    value={link.url}
                    onChange={(event) => {
                      const next = [...links];
                      next[linkIndex] = { ...link, url: event.target.value };
                      update({ actionLinks: next });
                    }}
                    placeholder="https:// or {{job.permit_portal_url}}"
                  />
                  <Input
                    value={link.when || ""}
                    onChange={(event) => {
                      const next = [...links];
                      next[linkIndex] = { ...link, when: event.target.value };
                      update({ actionLinks: next });
                    }}
                    placeholder="When to show"
                  />
                  <Input
                    value={csv(link.brandIncludes)}
                    onChange={(event) => {
                      const next = [...links];
                      next[linkIndex] = { ...link, brandIncludes: fromCsv(event.target.value) };
                      update({ actionLinks: next });
                    }}
                    placeholder="brand match words"
                  />
                  <div className="flex gap-2">
                    {link.url && !link.url.includes("{{") && (
                      <Button asChild variant="outline" size="icon" title="Open link">
                        <a href={link.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      title="Remove link"
                      onClick={() => update({ actionLinks: links.filter((_, idx) => idx !== linkIndex) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkflowPanel({
  type,
  steps,
  setSteps,
}: {
  type: WorkflowType;
  steps: WorkflowStepDefinition[];
  setSteps: (steps: WorkflowStepDefinition[]) => void;
}) {
  const updateStep = (index: number, step: WorkflowStepDefinition) => {
    const next = [...steps];
    next[index] = normalizeStep(step);
    setSteps(next);
  };
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setSteps(next);
  };

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <StepEditor
          key={`${type}-${step.key}-${index}`}
          step={step}
          index={index}
          total={steps.length}
          onChange={(updated) => updateStep(index, updated)}
          onMove={(direction) => moveStep(index, direction)}
          onDelete={() => setSteps(steps.filter((_, idx) => idx !== index))}
        />
      ))}
      <Button variant="outline" className="w-full" onClick={() => setSteps([...steps, newStep(steps.length)])}>
        <Plus className="mr-2 h-4 w-4" />
        Add workflow step
      </Button>
    </div>
  );
}

function UniversalTechFlow() {
  return (
    <Card className="border-emerald-300/60 bg-emerald-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-emerald-600" />
          Universal Tech Flow
        </CardTitle>
        <CardDescription>Same field rhythm for service, sales, maintenance, and install support work.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {UNIVERSAL_TECH_WORKFLOW.map((step, index) => (
            <div key={step.key} className="rounded-lg border bg-card p-3 text-center shadow-sm">
              <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">
                {index + 1}
              </span>
              <p className="mt-2 text-sm font-semibold">{step.title}</p>
              {step.formSections?.length ? <p className="mt-1 text-[11px] text-muted-foreground">{step.formSections.join(" / ")}</p> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkflowMaps() {
  const qc = useQueryClient();
  const { data: savedDefinitions = {}, isLoading } = useWorkflowDefinitions();
  const fallbackDefinitions = useMemo(() => WORKFLOW_TABS.reduce((acc, tab) => {
    acc[tab.id] = tab.fallback.map(normalizeStep);
    return acc;
  }, {} as Record<WorkflowType, WorkflowStepDefinition[]>), []);
  const [drafts, setDrafts] = useState<Record<WorkflowType, WorkflowStepDefinition[]>>(fallbackDefinitions);
  const [savingType, setSavingType] = useState<WorkflowType | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const tab of WORKFLOW_TABS) {
        next[tab.id] = (savedDefinitions[tab.id] || fallbackDefinitions[tab.id]).map(normalizeStep);
      }
      return next;
    });
  }, [fallbackDefinitions, savedDefinitions]);

  const saveWorkflow = async (type: WorkflowType) => {
    const steps = (drafts[type] || []).map(normalizeStep);
    if (steps.length === 0) {
      toast({ title: "Workflow needs at least one step" });
      return;
    }
    setSavingType(type);
    const { error } = await supabase
      .from("workflow_definitions" as any)
      .upsert({
        job_type: type,
        steps,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "job_type" });
    setSavingType(null);
    if (error) {
      toast({ title: "Could not save workflow", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["workflow-definitions-editor"] });
    await qc.invalidateQueries({ queryKey: ["workflow-definitions-active"] });
    toast({ title: "Workflow saved", description: "Jarvis and Now HQ will use the active version." });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ArrowRight className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Workflow Maps</h1>
                  <p className="text-sm text-muted-foreground">
                    Edit the company playbooks Jarvis uses to understand what step comes next and which portal links belong on a card.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className="border-blue-300/60 bg-blue-500/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="font-semibold">How this works</p>
            <p className="text-muted-foreground">
              These save into Supabase workflow definitions. Now HQ reads the active definitions, and the auto workflow engine already reads the same table.
              Use action links for real-world portals like Carrier Enterprise, SIBI Pro, jurisdiction lookup, and permit portals.
            </p>
          </CardContent>
        </Card>

        <UniversalTechFlow />

        <Tabs defaultValue="install" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            {WORKFLOW_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {WORKFLOW_TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="space-y-3">
              <div className="sticky top-[72px] z-10 flex flex-col gap-3 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{tab.label} Workflow</h2>
                  <p className="text-sm text-muted-foreground">
                    {isLoading ? "Loading active workflow..." : `${drafts[tab.id]?.length || 0} editable steps`}
                  </p>
                </div>
                <Button onClick={() => saveWorkflow(tab.id)} disabled={savingType === tab.id}>
                  <Save className={cn("mr-2 h-4 w-4", savingType === tab.id && "animate-pulse")} />
                  Save {tab.label}
                </Button>
              </div>
              <WorkflowPanel
                type={tab.id}
                steps={drafts[tab.id] || []}
                setSteps={(steps) => setDrafts((current) => ({ ...current, [tab.id]: steps }))}
              />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
