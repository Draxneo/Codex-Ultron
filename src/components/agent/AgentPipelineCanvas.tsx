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
import PipelineNodeComponent from "./PipelineNode";
import { PipelineNodeDetail } from "./PipelineNodeDetail";

const nodeTypes = { pipeline: PipelineNodeComponent as any };

interface PipelineStage {
  id: string; stage: string; label: string; detail: string;
  count?: number; link?: string; position: { x: number; y: number };
}

interface Props {
  counts: { instructions: number; tools: number; learnings: number; model: string };
}

function buildStages(c: Props["counts"]): PipelineStage[] {
  return [
    { id: "input", stage: "input", label: "User Input", detail: "Message received via chat, SMS, or voice transcription.", position: { x: 350, y: 0 } },
    { id: "context", stage: "context", label: "Context Injection", detail: "Company identity, customer history, job data, and knowledge base injected.", link: "/agent-training", position: { x: 350, y: 150 } },
    { id: "instructions", stage: "instructions", label: "Instructions", detail: "Active instruction sets that guide agent behavior.", count: c.instructions, link: "/agent-training", position: { x: 200, y: 300 } },
    { id: "tools", stage: "tools", label: "Tool Selection", detail: "Available tools the agent can invoke to complete tasks.", count: c.tools, link: "/agent-training", position: { x: 500, y: 300 } },
    { id: "model", stage: "model", label: "AI Model", detail: `Processing with ${c.model}. Reasoning, tool calls, and response generation.`, link: "/agent-training", position: { x: 350, y: 450 } },
    { id: "output", stage: "output", label: "Response", detail: "Formatted output delivered to user via original channel.", position: { x: 350, y: 600 } },
    { id: "learning", stage: "learning", label: "Learning Log", detail: "Corrections and feedback stored for continuous improvement.", count: c.learnings, link: "/agent-training", position: { x: 550, y: 600 } },
  ];
}

const EDGES: Edge[] = [
  { id: "e1", source: "input", target: "context", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e2", source: "context", target: "instructions", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e3", source: "context", target: "tools", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e4", source: "instructions", target: "model", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e5", source: "tools", target: "model", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e6", source: "model", target: "output", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } },
  { id: "e7", source: "output", target: "learning", type: "smoothstep", animated: true, style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
];

export function AgentPipelineCanvas({ counts }: Props) {
  const stages = useMemo(() => buildStages(counts), [counts]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { applyPositions, savePositions, positionsReady } = useCanvasPositions("agent-pipeline");
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const initialNodes: Node[] = stages.map(s => ({
    id: s.id, type: "pipeline" as const, position: s.position, selected: s.id === selectedId,
    data: { stage: s.stage, label: s.label, detail: s.detail, count: s.count, onSelect },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(EDGES);

  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return stages.map(s => ({
        id: s.id, type: "pipeline" as const, position: posMap.get(s.id) ?? s.position, selected: s.id === selectedId,
        data: { stage: s.stage, label: s.label, detail: s.detail, count: s.count, onSelect },
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
      <PipelineNodeDetail
        stage={selectedStage ? { id: selectedStage.id, label: selectedStage.label, detail: selectedStage.detail, count: selectedStage.count, link: selectedStage.link } : null}
        open={!!selectedId} onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
