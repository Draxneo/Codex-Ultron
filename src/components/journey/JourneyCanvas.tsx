import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState,
  type Node, type Edge,
  MarkerType, BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasPositions } from "@/hooks/useCanvasPositions";
import JourneyNodeComponent from "./JourneyNode";
import { JourneyNodeDetail } from "./JourneyNodeDetail";

const nodeTypes = { journey: JourneyNodeComponent as any };

interface JourneyStage {
  id: string; stage: string; label: string; count: number;
  conversionRate?: number; description: string; position: { x: number; y: number };
}

interface Props {
  metrics: {
    leads: number; estimates: number; won: number; jobs: number;
    invoices: number; paid: number; reviews: number; maintenance: number;
  };
}

function buildStages(m: Props["metrics"]): JourneyStage[] {
  const estRate = m.leads > 0 ? Math.round((m.estimates / m.leads) * 100) : 0;
  const wonRate = m.estimates > 0 ? Math.round((m.won / m.estimates) * 100) : 0;
  const paidRate = m.invoices > 0 ? Math.round((m.paid / m.invoices) * 100) : 0;
  return [
    { id: "lead", stage: "lead", label: "Leads", count: m.leads, description: "New customer inquiries and inbound leads.", position: { x: 350, y: 0 } },
    { id: "estimate", stage: "estimate", label: "Estimates", count: m.estimates, conversionRate: estRate, description: "Proposals sent to customers.", position: { x: 350, y: 140 } },
    { id: "won", stage: "won", label: "Won Deals", count: m.won, conversionRate: wonRate, description: "Estimates converted to active jobs.", position: { x: 200, y: 280 } },
    { id: "job", stage: "job", label: "Active Jobs", count: m.jobs, description: "Currently scheduled or in-progress jobs.", position: { x: 200, y: 420 } },
    { id: "invoice", stage: "invoice", label: "Invoiced", count: m.invoices, description: "Jobs with invoices generated.", position: { x: 200, y: 560 } },
    { id: "payment", stage: "payment", label: "Paid", count: m.paid, conversionRate: paidRate, description: "Invoices collected successfully.", position: { x: 200, y: 700 } },
    { id: "review", stage: "review", label: "Reviews", count: m.reviews, description: "Review requests sent after completion.", position: { x: 500, y: 560 } },
    { id: "maintenance", stage: "maintenance", label: "Maintenance Plans", count: m.maintenance, description: "Recurring service agreements.", position: { x: 500, y: 700 } },
    { id: "referral", stage: "referral", label: "Referrals", count: 0, description: "Customer referrals generating new leads.", position: { x: 350, y: 840 } },
  ];
}

const EDGES: Edge[] = [
  { id: "e-lead-est", source: "lead", target: "estimate", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e-est-won", source: "estimate", target: "won", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e-won-job", source: "won", target: "job", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e-job-inv", source: "job", target: "invoice", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e-inv-pay", source: "invoice", target: "payment", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e-job-rev", source: "job", target: "review", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-rev-maint", source: "review", target: "maintenance", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-pay-ref", source: "payment", target: "referral", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-maint-ref", source: "maintenance", target: "referral", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
];

export function JourneyCanvas({ metrics }: Props) {
  const stages = useMemo(() => buildStages(metrics), [metrics]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { applyPositions, savePositions, positionsReady } = useCanvasPositions("customer-journey");
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const initialNodes: Node[] = stages.map(s => ({
    id: s.id, type: "journey" as const, position: s.position, selected: s.id === selectedId,
    data: { stage: s.stage, label: s.label, count: s.count, conversionRate: s.conversionRate, onSelect },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(EDGES);

  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return stages.map(s => ({
        id: s.id, type: "journey" as const, position: posMap.get(s.id) ?? s.position, selected: s.id === selectedId,
        data: { stage: s.stage, label: s.label, count: s.count, conversionRate: s.conversionRate, onSelect },
      }));
    });
  }, [stages, onSelect, selectedId]);

  useEffect(() => {
    if (positionsReady) setNodes((prev) => applyPositions(prev));
  }, [positionsReady, applyPositions, setNodes]);

  const handleSave = useCallback(async () => {
    await savePositions(nodes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [nodes, savePositions]);

  const selectedStage = stages.find(s => s.id === selectedId) || null;

  return (
    <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden relative">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3} maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap className="!bg-card !border-border" nodeColor="hsl(var(--primary))" maskColor="hsl(var(--muted) / 0.5)" />
        <Panel position="top-right">
          <Button onClick={handleSave} size="sm" variant={saved ? "outline" : "default"} className="gap-1.5 shadow-md">
            {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "Saved!" : "Save Layout"}
          </Button>
        </Panel>
      </ReactFlow>
      <JourneyNodeDetail
        stage={selectedStage ? { id: selectedStage.id, label: selectedStage.label, count: selectedStage.count, description: selectedStage.description } : null}
        open={!!selectedId} onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
