/**
 * WorkflowBuilder — Consolidated workflow editor.
 * Two views:
 *   1. "Tech Form" — ONE universal Snap & Talk flow + per-type field config
 *   2. "Office Workflow" — Per-job-type React Flow canvas (scheduling, permits, invoicing)
 */
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Workflow, Smartphone } from "lucide-react";
import { useWorkflowDefinitions, getDefaultSteps } from "@/hooks/useWorkflowDefinitions";
import { useNavigate } from "react-router-dom";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { TechFormConfigView } from "@/components/workflow/TechFormConfigView";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";

const WorkflowBuilder = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [hasAutoFixed, setHasAutoFixed] = useState(false);
  const [viewMode, setViewMode] = useState<"tech" | "office">("tech");
  const { data: definitions, isLoading, seedIfEmpty, updateWorkflow, reseedWorkflow } = useWorkflowDefinitions();

  /* Auto-seed default workflows if none exist, fill missing job types, and fix stale rows */
  useEffect(() => {
    if (definitions !== undefined && !hasAutoFixed) {
      if (definitions.length === 0) {
        seedIfEmpty.mutate();
        setHasAutoFixed(true);
      } else {
        const existingTypes = new Set(definitions.map(d => d.job_type));
        const allTypes = ["install", "service", "maintenance", "estimate", "csr", "csr_sms", "phone_call", "ductwork"];
        const hasMissing = allTypes.some(t => !existingTypes.has(t));
        if (hasMissing) seedIfEmpty.mutate();

        for (const def of definitions) {
          const steps = Array.isArray(def.steps) ? def.steps : JSON.parse(def.steps as any);
          const defaultSteps = getDefaultSteps(def.job_type);
          if (steps.length < defaultSteps.length * 0.6) {
            reseedWorkflow.mutate({ id: def.id, job_type: def.job_type });
          }
        }
        setHasAutoFixed(true);
      }
    }
  }, [definitions, hasAutoFixed]);

  const officeTabs = ["install", "service", "maintenance", "estimate", "csr", "csr_sms", "phone_call", "ductwork"];
  const tabLabels: Record<string, string> = { csr: "CSR Call Flow", csr_sms: "CSR SMS Flow", phone_call: "Phone Call", ductwork: "Duct Work" };

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <div className="container py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings?tab=workflow")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Workflow Builder</h1>
            <p className="text-sm text-muted-foreground">
              {viewMode === "tech"
                ? "Universal tech form — same flow for every job type"
                : "Office workflows — scheduling, permits, invoicing per job type"}
            </p>
          </div>

          {/* View mode toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as "tech" | "office")}
            className="bg-muted rounded-lg border p-0.5 ml-auto"
          >
            <ToggleGroupItem value="tech" className="text-xs gap-1.5 px-3 h-8 rounded-md">
              <Smartphone className="h-3.5 w-3.5" /> Tech Form
            </ToggleGroupItem>
            <ToggleGroupItem value="office" className="text-xs gap-1.5 px-3 h-8 rounded-md">
              <Workflow className="h-3.5 w-3.5" /> Office Workflow
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading workflows…</div>
        ) : viewMode === "tech" ? (
          /* ── TECH FORM: Universal flow + per-type config ── */
          <TechFormConfigView />
        ) : (
          /* ── OFFICE WORKFLOW: Per-job-type canvas ── */
          <Tabs defaultValue="install">
            <div className="flex items-center gap-2 mb-2">
              <TabsList className="flex-1">
                {officeTabs.map(t => {
                  const def = definitions?.find(d => d.job_type === t);
                  const stepCount = def
                    ? (Array.isArray(def.steps) ? def.steps.length : JSON.parse(def.steps as any).length)
                    : 0;
                  return (
                    <TabsTrigger key={t} value={t} className="flex-1 capitalize text-xs">
                      {tabLabels[t] || t}{stepCount > 0 ? ` (${stepCount})` : ""}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!definitions) return;
                  const activeTab = document.querySelector('[data-state="active"][role="tab"]')?.textContent?.toLowerCase().split(" ")[0] || "install";
                  const def = definitions.find(d => d.job_type === activeTab);
                  if (def) {
                    reseedWorkflow.mutate({ id: def.id, job_type: def.job_type }, {
                      onSuccess: () => toast({ title: "Workflow reset to defaults", description: `${activeTab} workflow restored` }),
                    });
                  }
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset
              </Button>
            </div>

            {officeTabs.map(t => {
              const def = definitions?.find(d => d.job_type === t);
              return (
                <TabsContent key={t} value={t}>
                  {def ? (
                    <WorkflowCanvas definition={def} updateWorkflow={updateWorkflow} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No workflow defined for "{t}" yet. Seeding defaults…
                    </p>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default WorkflowBuilder;
