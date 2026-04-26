/**
 * WorkflowCanvas — Visual node-based workflow editor using React Flow.
 * Renders workflow steps as draggable cards connected by animated edges.
 * Supports adding/deleting steps, drag-to-reposition, and click-to-edit
 * via the StepNodeDetail side panel.
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
  MarkerType,
  Panel,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Plus, Save, Check, LayoutGrid } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useCanvasPositions } from "@/hooks/useCanvasPositions";
import StepNodeComponent, { type StepNodeData } from "./StepNode";
import { StepNodeDetail } from "./StepNodeDetail";
import type { WorkflowStep, WorkflowDefinition } from "@/hooks/useWorkflowDefinitions";
import { getDefaultFormSections } from "@/hooks/useWorkflowDefinitions";

/* ── Register custom node type ── */
const nodeTypes = { step: StepNodeComponent as any };

/* ── Calculate auto-layout positions from sort_order ── */
function autoLayoutPosition(index: number): { x: number; y: number } {
  const COLS = 4;
  const X_GAP = 320;
  const Y_GAP = 180;
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: col * X_GAP, y: row * Y_GAP };
}

/* ── Convert WorkflowSteps → React Flow nodes ── */
function stepsToNodes(
  steps: WorkflowStep[],
  onSelect: (id: string) => void,
  onSectionClick: (stepId: string, section: string) => void
): Node[] {
  return steps.map((step, i) => {
    const nodeData: StepNodeData = {
      ...step,
      form_sections: step.form_sections || getDefaultFormSections(step.id) || [],
      stepIndex: i,
      totalSteps: steps.length,
      onSelect,
      onSectionClick,
    };
    return {
      id: step.id,
      type: "step" as const,
      position: step.position || autoLayoutPosition(i),
      data: nodeData,
    };
  });
}

/* ── Convert WorkflowSteps → React Flow edges (sequential chain) ── */
function stepsToEdges(steps: WorkflowStep[]): Edge[] {
  return steps.slice(0, -1).map((step, i) => ({
    id: `e-${step.id}-${steps[i + 1].id}`,
    source: step.id,
    target: steps[i + 1].id,
    type: "smoothstep",
    animated: true,
    style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
  }));
}

interface Props {
  definition: WorkflowDefinition;
  updateWorkflow: any;
}

export function WorkflowCanvas({ definition, updateWorkflow }: Props) {
  /* ── Parse steps from definition ── */
  const initialSteps = useMemo<WorkflowStep[]>(() => {
    const parsed: WorkflowStep[] = Array.isArray(definition.steps)
      ? definition.steps
      : JSON.parse(definition.steps as any);
    /* Merge form_sections from code defaults when DB version has none */
    return parsed.map(step => {
      if (!step.form_sections || step.form_sections.length === 0) {
        const fallback = getDefaultFormSections(step.id, definition.job_type);
        if (fallback.length) return { ...step, form_sections: fallback };
      }
      return step;
    });
  }, [definition]);

  const [steps, setSteps] = useState<WorkflowStep[]>(initialSteps);
  const [dirty, setDirty] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  /* Reset when definition changes (tab switch) */
  useEffect(() => {
    setSteps(initialSteps);
    setDirty(false);
    setSelectedStepId(null);
    setSelectedSection(null);
  }, [initialSteps]);

  /* ── Node selection callback (passed into each node) ── */
  const onSelect = useCallback((id: string) => {
    setSelectedStepId(id);
    setSelectedSection(null);
  }, []);

  /* ── Section click callback (passed into each node) ── */
  const onSectionClick = useCallback((stepId: string, section: string) => {
    setSelectedStepId(stepId);
    setSelectedSection(section);
  }, []);

  const { applyPositions, savePositions, positionsReady } = useCanvasPositions(`workflow-${definition.id}`);

  /* ── Build React Flow nodes + edges from steps ── */
  const [nodes, setNodes, onNodesChange] = useNodesState(stepsToNodes(steps, onSelect, onSectionClick));
  const [edges, setEdges, onEdgesChange] = useEdgesState(stepsToEdges(steps));

  /* Apply saved positions once loaded */
  useEffect(() => {
    if (positionsReady) {
      setNodes((prev) => applyPositions(prev));
    }
  }, [positionsReady, applyPositions, setNodes]);

  /* Rebuild nodes/edges when steps change, preserving dragged positions */
  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return stepsToNodes(steps, onSelect, onSectionClick).map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      }));
    });
    setEdges(stepsToEdges(steps));
  }, [steps, onSelect, onSectionClick]);

  /* ── Track node position changes ── */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      /* Persist position changes back to steps */
      const posChanges = changes.filter(
        (c): c is NodeChange & { type: "position"; id: string; position: { x: number; y: number } } =>
          c.type === "position" && "position" in c && !!c.position
      );

      if (posChanges.length > 0) {
        setSteps(prev => {
          const next = [...prev];
          for (const ch of posChanges) {
            const idx = next.findIndex(s => s.id === ch.id);
            if (idx >= 0) {
              next[idx] = { ...next[idx], position: ch.position };
            }
          }
          return next;
        });
        setDirty(true);
      }
    },
    [onNodesChange]
  );

  /* ── Add new step ── */
  const addStep = useCallback(() => {
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      label: "New Step",
      description: "Describe what happens here",
      icon: "check-circle",
      automations: [],
      primary_action: "none",
      sort_order: steps.length,
      notes: [],
      integrations: [],
      timestamp_field: null,
      completion_check: "timestamp",
      position: { x: 100, y: (steps.length % 4) * 180 + 100 },
    };
    setSteps(prev => [...prev, newStep]);
    setDirty(true);
    setSelectedStepId(newStep.id);
  }, [steps.length]);

  /* ── Auto-layout all nodes ── */
  const autoLayout = useCallback(() => {
    setSteps(prev =>
      prev.map((s, i) => ({ ...s, position: autoLayoutPosition(i) }))
    );
    setDirty(true);
  }, []);

  /* ── Save to database ── */
  const save = useCallback(async () => {
    try {
      await Promise.all([
        updateWorkflow.mutateAsync({ id: definition.id, steps }),
        savePositions(nodes),
      ]);
      setDirty(false);
    } catch {
      toast({ title: "Error saving workflow", variant: "destructive" });
    }
  }, [definition.id, steps, updateWorkflow, savePositions, nodes]);

  /* ── Update a step from the detail panel ── */
  const handleStepUpdate = useCallback((updated: WorkflowStep) => {
    setSteps(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    setDirty(true);
  }, []);

  /* ── Delete the selected step ── */
  const handleDeleteStep = useCallback((stepId: string) => {
    setSteps(prev => {
      const next = prev.filter(s => s.id !== stepId);
      next.forEach((s, i) => (s.sort_order = i));
      return next;
    });
    setSelectedStepId(null);
    setDirty(true);
  }, []);

  const selectedStep = steps.find(s => s.id === selectedStepId) || null;

  return (
    <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden relative">
      <ReactFlow
        key={definition.id}
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor="hsl(var(--primary))"
          maskColor="hsl(var(--muted) / 0.5)"
        />

        {/* Toolbar */}
        <Panel position="top-right" className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={addStep}>
            <Plus className="h-3.5 w-3.5" /> Add Step
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={autoLayout}>
            <LayoutGrid className="h-3.5 w-3.5" /> Auto Layout
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={save}
            disabled={!dirty || updateWorkflow.isPending}
          >
            <Save className="h-3.5 w-3.5" /> {dirty ? "Save *" : "Saved"}
          </Button>
        </Panel>
      </ReactFlow>

      {/* Step detail side panel */}
      <StepNodeDetail
        step={selectedStep}
        open={!!selectedStepId}
        onClose={() => { setSelectedStepId(null); setSelectedSection(null); }}
        onSave={handleStepUpdate}
        jobType={definition.job_type}
        initialSection={selectedSection}
      />
    </div>
  );
}
