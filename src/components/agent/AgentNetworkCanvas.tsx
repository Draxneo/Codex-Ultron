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
import AgentNodeComponent from "./AgentNode";
import { AgentNodeDetail } from "./AgentNodeDetail";
import type { AgentRow, AgentConnectionRow } from "@/hooks/useAgentNetwork";

const nodeTypes = { agent: AgentNodeComponent as any };

interface Props {
  agents: AgentRow[];
  connections: AgentConnectionRow[];
  onPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onStatusToggle?: (id: string, status: string) => void;
  onUpdateAgent?: (id: string, fields: Partial<AgentRow>) => void;
}

export function AgentNetworkCanvas({ agents, connections, onPositionChange, onStatusToggle, onUpdateAgent }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { applyPositions, savePositions, positionsReady } = useCanvasPositions("agent-network");
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const initialNodes: Node[] = useMemo(() =>
    agents.map((a) => ({
      id: a.id,
      type: "agent" as const,
      position: a.position || { x: 0, y: 0 },
      draggable: true,
      selectable: true,
      data: {
        name: a.name, label: a.label, description: a.description, status: a.status,
        edge_function: a.edge_function, toolCount: a.tools?.length || 0,
        triggers: a.triggers || [], type: a.type || "agent", notes: a.notes || null, onSelect,
      },
    })),
    [agents, onSelect]
  );

  const initialEdges: Edge[] = useMemo(() =>
    connections.map((c) => ({
      id: c.id, source: c.source_agent_id, target: c.target_agent_id,
      type: "smoothstep", animated: true,
      label: c.trigger_description || undefined,
      labelStyle: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
      labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.9 },
      labelBgPadding: [6, 3] as [number, number],
      style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
    })),
    [connections]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return initialNodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }));
    });
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (positionsReady) setNodes((prev) => applyPositions(prev));
  }, [positionsReady, applyPositions, setNodes]);

  const handleNodeDragStop = useCallback((_: any, node: Node) => {
    onPositionChange?.(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
  }, [onPositionChange]);

  const handleSave = useCallback(async () => {
    await savePositions(nodes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [nodes, savePositions]);

  const selectedAgent = agents.find((a) => a.id === selectedId) || null;

  return (
    <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden relative">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
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
      <AgentNodeDetail
        agent={selectedAgent} open={!!selectedId} onClose={() => setSelectedId(null)}
        onStatusToggle={onStatusToggle} onUpdateAgent={onUpdateAgent}
      />
    </div>
  );
}
