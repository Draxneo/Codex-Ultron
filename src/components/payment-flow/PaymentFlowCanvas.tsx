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
import PaymentFlowNodeComponent from "./PaymentFlowNode";
import { PaymentFlowNodeDetail } from "./PaymentFlowNodeDetail";

const nodeTypes = { paymentFlow: PaymentFlowNodeComponent as any };

interface PaymentStage {
  id: string; stage: string; label: string; count: number; amount: number;
  description: string; position: { x: number; y: number };
}

interface Props {
  metrics: {
    draft: number; draftAmt: number;
    sent: number; sentAmt: number;
    paid: number; paidAmt: number;
    overdue: number; overdueAmt: number;
    failed: number;
  };
}

function buildStages(m: Props["metrics"]): PaymentStage[] {
  return [
    { id: "created", stage: "created", label: "Invoice Created", count: m.draft + m.sent + m.paid, amount: m.draftAmt + m.sentAmt + m.paidAmt, description: "All invoices generated from completed jobs.", position: { x: 350, y: 0 } },
    { id: "sent", stage: "sent", label: "Invoice Sent", count: m.sent + m.paid, amount: m.sentAmt + m.paidAmt, description: "Invoices sent to customers via email or SMS.", position: { x: 350, y: 150 } },
    { id: "link", stage: "link", label: "Payment Link", count: m.sent, amount: m.sentAmt, description: "Active payment links awaiting customer action.", position: { x: 350, y: 300 } },
    { id: "succeeded", stage: "succeeded", label: "Payment Succeeded", count: m.paid, amount: m.paidAmt, description: "Successfully collected payments.", position: { x: 200, y: 450 } },
    { id: "failed", stage: "failed", label: "Payment Failed", count: m.failed, amount: 0, description: "Payments that failed or were declined.", position: { x: 500, y: 450 } },
    { id: "overdue", stage: "overdue", label: "Overdue (7+ Days)", count: m.overdue, amount: m.overdueAmt, description: "Invoices unpaid for more than 7 days.", position: { x: 500, y: 600 } },
    { id: "receipt", stage: "receipt", label: "Receipt Sent", count: m.paid, amount: m.paidAmt, description: "Payment confirmations sent to customers.", position: { x: 200, y: 600 } },
  ];
}

const EDGES: Edge[] = [
  { id: "e1", source: "created", target: "sent", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e2", source: "sent", target: "link", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e3", source: "link", target: "succeeded", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e4", source: "link", target: "failed", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--destructive))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--destructive))" } },
  { id: "e5", source: "failed", target: "overdue", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--destructive))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--destructive))" } },
  { id: "e6", source: "succeeded", target: "receipt", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
];

export function PaymentFlowCanvas({ metrics }: Props) {
  const stages = useMemo(() => buildStages(metrics), [metrics]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { applyPositions, savePositions, positionsReady } = useCanvasPositions("payment-flow");
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const initialNodes: Node[] = stages.map(s => ({
    id: s.id, type: "paymentFlow" as const, position: s.position, selected: s.id === selectedId,
    data: { stage: s.stage, label: s.label, count: s.count, amount: s.amount, onSelect },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(EDGES);

  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return stages.map(s => ({
        id: s.id, type: "paymentFlow" as const, position: posMap.get(s.id) ?? s.position, selected: s.id === selectedId,
        data: { stage: s.stage, label: s.label, count: s.count, amount: s.amount, onSelect },
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
      <PaymentFlowNodeDetail
        stage={selectedStage ? { id: selectedStage.id, label: selectedStage.label, count: selectedStage.count, amount: selectedStage.amount, description: selectedStage.description } : null}
        open={!!selectedId} onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
