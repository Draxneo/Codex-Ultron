import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeChange,
  MarkerType, Panel, BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Plus, Save, Check, LayoutGrid } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useCanvasPositions } from "@/hooks/useCanvasPositions";
import SequenceNodeComponent from "./SequenceNode";
import { SequenceNodeDetail } from "./SequenceNodeDetail";
import type { SequenceStep, MessageSequence } from "@/hooks/useMessageSequences";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const nodeTypes = { sequence: SequenceNodeComponent as any };

function autoLayout(index: number): { x: number; y: number } {
  return { x: 300, y: index * 160 };
}

function stepsToNodes(steps: SequenceStep[], onSelect: (id: string) => void): Node[] {
  return steps.map((step, i) => ({
    id: step.id,
    type: "sequence" as const,
    position: step.position || autoLayout(i),
    data: { stepType: step.type, label: step.label, config: step.config, onSelect },
  }));
}

function stepsToEdges(steps: SequenceStep[]): Edge[] {
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
  sequence: MessageSequence;
  onSave: (seq: MessageSequence) => void;
  saving: boolean;
}

export function SequenceCanvas({ sequence, onSave, saving }: Props) {
  const [steps, setSteps] = useState<SequenceStep[]>(sequence.steps);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<string>("send_sms");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => { setSteps(sequence.steps); setDirty(false); setSelectedId(null); }, [sequence]);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const [nodes, setNodes, onNodesChange] = useNodesState(stepsToNodes(steps, onSelect));
  const [edges, setEdges, onEdgesChange] = useEdgesState(stepsToEdges(steps));

  useEffect(() => {
    setNodes(stepsToNodes(steps, onSelect));
    setEdges(stepsToEdges(steps));
  }, [steps, onSelect]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    const posChanges = changes.filter(
      (c): c is NodeChange & { type: "position"; id: string; position: { x: number; y: number } } =>
        c.type === "position" && "position" in c && !!c.position
    );
    if (posChanges.length > 0) {
      setSteps(prev => {
        const next = [...prev];
        for (const ch of posChanges) {
          const idx = next.findIndex(s => s.id === ch.id);
          if (idx >= 0) next[idx] = { ...next[idx], position: ch.position };
        }
        return next;
      });
      setDirty(true);
    }
  }, [onNodesChange]);

  const addStep = useCallback(() => {
    if (!newLabel.trim()) return;
    const step: SequenceStep = {
      id: `step_${Date.now()}`,
      type: newType as any,
      label: newLabel,
      config: {},
      position: autoLayout(steps.length),
    };
    setSteps(prev => [...prev, step]);
    setDirty(true);
    setNewLabel("");
    setAddOpen(false);
  }, [newType, newLabel, steps.length]);

  const doAutoLayout = useCallback(() => {
    setSteps(prev => prev.map((s, i) => ({ ...s, position: autoLayout(i) })));
    setDirty(true);
  }, []);

  const { savePositions: saveCanvasPositions } = useCanvasPositions("sequence");

  const save = useCallback(async () => {
    onSave({ ...sequence, steps });
    await saveCanvasPositions(nodes);
    setDirty(false);
  }, [sequence, steps, onSave, nodes, saveCanvasPositions]);

  const handleStepUpdate = useCallback((updated: SequenceStep) => {
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));
    setDirty(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
    setSelectedId(null);
    setDirty(true);
  }, []);

  const selectedStep = steps.find(s => s.id === selectedId) || null;

  return (
    <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden relative">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={handleNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3} maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap className="!bg-card !border-border" nodeColor="hsl(var(--primary))" maskColor="hsl(var(--muted) / 0.5)" />
        <Panel position="top-right" className="flex gap-2">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"><Plus className="h-3.5 w-3.5" /> Add Step</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Step Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trigger">Trigger</SelectItem>
                    <SelectItem value="delay">Delay</SelectItem>
                    <SelectItem value="send_sms">Send SMS</SelectItem>
                    <SelectItem value="send_email">Send Email</SelectItem>
                    <SelectItem value="ai_check">AI Check</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                    <SelectItem value="end">End</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Step name" />
              </div>
              <Button size="sm" className="w-full" onClick={addStep}>Add</Button>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={doAutoLayout}>
            <LayoutGrid className="h-3.5 w-3.5" /> Auto Layout
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={save} disabled={!dirty || saving}>
            <Save className="h-3.5 w-3.5" /> {dirty ? "Save *" : "Saved"}
          </Button>
        </Panel>
      </ReactFlow>
      <SequenceNodeDetail step={selectedStep} open={!!selectedId} onClose={() => setSelectedId(null)} onSave={handleStepUpdate} onDelete={handleDelete} />
    </div>
  );
}
