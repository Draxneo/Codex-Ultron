/**
 * IvrCanvas — React Flow canvas with drag-and-drop and inline editing.
 */
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasPositions } from "@/hooks/useCanvasPositions";
import IvrNodeComponent, { type IvrNodeData } from "./IvrNode";
import { IvrNodeDetail } from "./IvrNodeDetail";
import type { IvrConfig, IvrMenuOption } from "@/hooks/useIvrConfig";

const nodeTypes: NodeTypes = {
  ivrNode: IvrNodeComponent as any,
};

interface IvrCanvasProps {
  config: IvrConfig;
  menuOptions: IvrMenuOption[];
  profiles: { id: string; full_name: string }[];
  onUpdateConfig: (updates: Partial<IvrConfig>) => void;
  onUpdateDept: (updates: Partial<IvrMenuOption> & { digit: string }, silent?: boolean) => void;
  onDeleteDept: (id: string) => void;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function previewTemplate(raw?: string | null, key?: string | null, fallback?: string) {
  if (raw) return raw.slice(0, 60) + (raw.length > 60 ? "…" : "");
  if (key) return `Template • ${key}`;
  return fallback || "No SMS configured";
}

function buildGraph(config: IvrConfig, menuOptions: IvrMenuOption[], onSelect: (id: string) => void) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const X_GAP = 280;
  const Y_START = 100;
  const Y_GAP = 120;

  nodes.push({
    id: "incoming",
    type: "ivrNode",
    position: { x: 0, y: Y_START + 60 },
      data: { nodeType: "incoming", label: "Incoming Call", subtitle: "Inbound call enters this app's IVR", onSelect } satisfies IvrNodeData,
  });

  nodes.push({
    id: "holiday",
    type: "ivrNode",
    position: { x: X_GAP, y: Y_START + 60 },
    data: { nodeType: "holiday", label: "Holiday Check", subtitle: "Auto-detects major US holidays", onSelect } satisfies IvrNodeData,
  });

  edges.push({ id: "e-incoming-holiday", source: "incoming", target: "holiday", animated: true, style: { stroke: "hsl(var(--primary))" } });

  const greetingSubtitle = menuOptions.length > 0
    ? `Menu: ${menuOptions.map(o => `${o.digit}=${o.label}`).join(", ")}`
    : "Direct dial — no menu";

  nodes.push({
    id: "greeting",
    type: "ivrNode",
    position: { x: X_GAP * 2, y: Y_START + 60 },
    data: { nodeType: "greeting", label: "Greeting & Menu", subtitle: greetingSubtitle, onSelect } satisfies IvrNodeData,
  });

  edges.push({ id: "e-holiday-greeting", source: "holiday", target: "greeting", animated: true, style: { stroke: "hsl(var(--primary))" } });

  nodes.push({
    id: "holiday-vm",
    type: "ivrNode",
    position: { x: X_GAP * 2, y: Y_START - 80 },
    data: { nodeType: "voicemail", label: "Holiday Voicemail", subtitle: "Holiday greeting + record", onSelect } satisfies IvrNodeData,
  });

  edges.push({ id: "e-holiday-vm", source: "holiday", target: "holiday-vm", animated: false, style: { stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }, label: "Holiday" });

  if (menuOptions.length > 0) {
    const deptStartY = Y_START - ((menuOptions.length - 1) * Y_GAP) / 2 + 60;

    menuOptions.forEach((opt, i) => {
      const deptId = `dept-${opt.digit}`;
      const hoursLabel = opt.dept_hours_start && opt.dept_hours_end
        ? `${formatTime12(opt.dept_hours_start)}–${formatTime12(opt.dept_hours_end)}`
        : undefined;

      nodes.push({
        id: deptId,
        type: "ivrNode",
        position: { x: X_GAP * 3, y: deptStartY + i * Y_GAP },
        data: {
          nodeType: "department", label: opt.label, digit: opt.digit,
          subtitle: opt.action_type === "forward_phone" ? `→ ${opt.forward_to}` : undefined,
          actionType: opt.action_type, hoursLabel,
          assignedCount: opt.assigned_user_ids?.length || 0,
          onSelect,
        } satisfies IvrNodeData,
      });

      edges.push({
        id: `e-greeting-${deptId}`, source: "greeting", target: deptId,
        animated: true, label: `Press ${opt.digit}`, style: { stroke: "hsl(var(--primary))" },
      });

      // No Answer node — fires after ring_timeout_seconds with no pickup
      const naId = `na-${opt.digit}`;
      nodes.push({
        id: naId, type: "ivrNode",
        position: { x: X_GAP * 4, y: deptStartY + i * Y_GAP },
        data: { nodeType: "no_answer", label: "No Answer", subtitle: `${config.ring_timeout_seconds}s timeout → SMS + VM`, onSelect } satisfies IvrNodeData,
      });

      edges.push({
        id: `e-${deptId}-na`, source: deptId, target: naId,
        animated: false, style: { stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }, label: "No answer",
      });

      // Missed Call SMS node — fires on no-answer/no-VM paths (voicemail flow uses the same body as fallback)
      const smsId = `sms-${opt.digit}`;
      const smsPreview = previewTemplate(
        opt.dept_no_vm_missed_call_sms || opt.dept_missed_call_sms,
        opt.dept_missed_call_sms_template_key,
        "No missed-call SMS configured"
      );
      nodes.push({
        id: smsId, type: "ivrNode",
        position: { x: X_GAP * 5, y: deptStartY + i * Y_GAP - 40 },
        data: { nodeType: "sms", label: "Missed Call SMS", subtitle: smsPreview, onSelect } satisfies IvrNodeData,
      });
      edges.push({
        id: `e-${naId}-sms`, source: naId, target: smsId,
        animated: false, style: { stroke: "hsl(var(--blue-500, 210 100% 50%))" }, label: "Auto SMS",
      });

      // Post-call SMS node — fires after a completed inbound call to this department
      const postCallSmsId = `sms-post-${opt.digit}`;
      const postCallPreview = opt.dept_post_call_sms_enabled === true
        ? previewTemplate(opt.dept_post_call_sms, null, "No post-call SMS body configured")
        : "Off";
      nodes.push({
        id: postCallSmsId, type: "ivrNode",
        position: { x: X_GAP * 4, y: deptStartY + i * Y_GAP - 82 },
        data: { nodeType: "sms", label: "Post-Call SMS", subtitle: postCallPreview, onSelect } satisfies IvrNodeData,
      });
      edges.push({
        id: `e-${deptId}-post-sms`, source: deptId, target: postCallSmsId,
        animated: false, style: { stroke: "hsl(142 72% 40%)" }, label: "Completed call",
      });

      // Voicemail node — optional, caller may or may not leave one
      const vmId = `vm-${opt.digit}`;
      nodes.push({
        id: vmId, type: "ivrNode",
        position: { x: X_GAP * 5, y: deptStartY + i * Y_GAP + 40 },
        data: { nodeType: "voicemail", label: "Voicemail", subtitle: `Optional — caller may hang up`, onSelect } satisfies IvrNodeData,
      });
      edges.push({
        id: `e-${naId}-vm`, source: naId, target: vmId,
        animated: false, style: { stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }, label: "Record",
      });

      if (opt.dept_hours_start && opt.dept_hours_end) {
        const ahId = `ah-${opt.digit}`;
        nodes.push({
          id: ahId, type: "ivrNode",
          position: { x: X_GAP * 4, y: deptStartY + i * Y_GAP + Y_GAP / 2 + 20 },
          data: { nodeType: "after_hours", label: "After Hours", subtitle: opt.dept_after_hours_greeting || "Closed — voicemail", onSelect } satisfies IvrNodeData,
        });

        edges.push({
          id: `e-${deptId}-ah`, source: deptId, target: ahId,
          animated: false, style: { stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }, label: "Closed",
        });

        // After-hours SMS node
        const ahSmsId = `sms-ah-${opt.digit}`;
        const ahSmsPreview = previewTemplate(
          opt.dept_after_hours_sms,
          opt.dept_after_hours_sms_template_key,
          "After-hours auto-reply"
        );
        nodes.push({
          id: ahSmsId, type: "ivrNode",
          position: { x: X_GAP * 5, y: deptStartY + i * Y_GAP + Y_GAP / 2 + 20 },
          data: { nodeType: "sms", label: "After-Hours SMS", subtitle: ahSmsPreview, onSelect } satisfies IvrNodeData,
        });
        edges.push({
          id: `e-${ahId}-sms`, source: ahId, target: ahSmsId,
          animated: false, style: { stroke: "hsl(var(--blue-500, 210 100% 50%))" }, label: "Auto SMS",
        });
      }
    });
  } else {
    nodes.push({
      id: "direct-ring", type: "ivrNode",
      position: { x: X_GAP * 3, y: Y_START + 60 },
      data: { nodeType: "department", label: "Direct Routing", subtitle: "All assigned app clients ring", actionType: "forward_client", onSelect } satisfies IvrNodeData,
    });
    edges.push({ id: "e-greeting-direct", source: "greeting", target: "direct-ring", animated: true, style: { stroke: "hsl(var(--primary))" } });

    nodes.push({
      id: "direct-na", type: "ivrNode",
      position: { x: X_GAP * 4, y: Y_START + 60 },
      data: { nodeType: "no_answer", label: "No Answer", subtitle: `${config.ring_timeout_seconds}s → SMS + VM`, onSelect } satisfies IvrNodeData,
    });
    edges.push({ id: "e-direct-na", source: "direct-ring", target: "direct-na", animated: false, style: { stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }, label: "No answer" });

    // Direct missed call SMS
    nodes.push({
      id: "sms-direct", type: "ivrNode",
      position: { x: X_GAP * 5, y: Y_START + 20 },
      data: { nodeType: "sms", label: "Missed Call SMS", subtitle: "Auto-reply to missed callers", onSelect } satisfies IvrNodeData,
    });
    edges.push({ id: "e-direct-na-sms", source: "direct-na", target: "sms-direct", animated: false, style: { stroke: "hsl(var(--blue-500, 210 100% 50%))" }, label: "Auto SMS" });

    nodes.push({
      id: "direct-vm", type: "ivrNode",
      position: { x: X_GAP * 5, y: Y_START + 100 },
      data: { nodeType: "voicemail", label: "Voicemail", subtitle: `Optional — caller may hang up`, onSelect } satisfies IvrNodeData,
    });
    edges.push({ id: "e-direct-na-vm", source: "direct-na", target: "direct-vm", animated: false, style: { stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }, label: "Record" });
  }

  nodes.push({
    id: "hangup", type: "ivrNode",
    position: { x: X_GAP * 3, y: Y_START + (menuOptions.length * Y_GAP) + 100 },
    data: { nodeType: "hangup", label: "Hangup", subtitle: "No input after 2 attempts", onSelect } satisfies IvrNodeData,
  });

  edges.push({
    id: "e-greeting-hangup", source: "greeting", target: "hangup",
    animated: false, style: { stroke: "hsl(var(--destructive))", strokeDasharray: "5 5" }, label: "Timeout",
  });

  // ── Hold Queue ──
  const queueWaitSeconds = Math.max(5, (config as any).overflow_ring_seconds_before_handoff || 5);
  const queueY = Y_START + (menuOptions.length * Y_GAP) + 200;
  nodes.push({
    id: "hold-queue", type: "ivrNode",
    position: { x: X_GAP * 5, y: queueY },
    data: {
      nodeType: "hold_music",
      label: "Hold Queue",
      subtitle: config.hold_music_audio_url
        ? `Custom queue audio - ${queueWaitSeconds}s`
        : `Fallback voice - ${queueWaitSeconds}s`,
      onSelect,
    } satisfies IvrNodeData,
  });
  if (menuOptions.length > 0) {
    menuOptions.forEach((opt) => {
      edges.push({
        id: `e-na-${opt.digit}-hold`, source: `na-${opt.digit}`, target: "hold-queue",
        animated: true, style: { stroke: "hsl(262 83% 58%)" }, label: "Busy / retry wait",
      });
    });
  } else {
    edges.push({
      id: "e-direct-na-hold", source: "direct-na", target: "hold-queue",
      animated: true, style: { stroke: "hsl(262 83% 58%)" }, label: "Busy / retry wait",
    });
  }

  // ── 24/7 Answering Service Overflow ──
  const overflowEnabled = (config as any).answering_service_enabled === true;
  const overflowNumber = (config as any).answering_service_number || "";
  const overflowLabel = (config as any).answering_service_label || "Answering Service";
  const overflowSubtitle = overflowEnabled
    ? (overflowNumber ? `→ ${overflowNumber}` : "No number set")
    : "Disabled — click to enable";

  const overflowY = queueY + 110;
  nodes.push({
    id: "overflow", type: "ivrNode",
    position: { x: X_GAP * 6, y: overflowY },
    data: {
      nodeType: "overflow",
      label: overflowEnabled ? `📞 ${overflowLabel}` : overflowLabel,
      subtitle: overflowSubtitle,
      onSelect,
    } satisfies IvrNodeData,
  });

  if (overflowEnabled && overflowNumber) {

    if ((config as any).overflow_on_busy || (config as any).overflow_on_no_answer) {
      edges.push({
        id: "e-hold-overflow", source: "hold-queue", target: "overflow",
        animated: true, style: { stroke: "hsl(189 94% 43%)" }, label: "Still busy",
      });
    }
    if ((config as any).overflow_after_hours) {
      menuOptions.forEach((opt) => {
        if (opt.dept_hours_start && opt.dept_hours_end) {
          edges.push({
            id: `e-ah-${opt.digit}-overflow`, source: `ah-${opt.digit}`, target: "overflow",
            animated: true, style: { stroke: "hsl(189 94% 43%)" }, label: "After hours",
          });
        }
      });
    }
  }

  // Normal call-related SMS now lives on visible per-department SMS nodes.

  return { nodes, edges };
}

export function IvrCanvas({ config, menuOptions, profiles, onUpdateConfig, onUpdateDept, onDeleteDept, testMode }: IvrCanvasProps & { testMode?: boolean }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { applyPositions, savePositions, positionsReady } = useCanvasPositions("ivr");

  const onSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(config, menuOptions, onSelect),
    [config, menuOptions, onSelect]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // Apply saved positions once loaded
  useEffect(() => {
    if (positionsReady) {
      setNodes((prev) => applyPositions(prev));
    }
  }, [positionsReady, applyPositions, setNodes]);

  // Sync when config/menuOptions change but preserve user-dragged positions
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildGraph(config, menuOptions, onSelect);
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return newNodes.map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      }));
    });
    setEdges(newEdges);
  }, [config, menuOptions, onSelect, setNodes, setEdges]);

  const handleSaveAll = useCallback(async () => {
    await savePositions(nodes);
    onUpdateConfig({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [nodes, onUpdateConfig, savePositions]);

  const handleNodeDragStop = useCallback<OnNodeDrag<Node>>((_event, _node, currentNodes) => {
    void savePositions(currentNodes.length ? currentNodes : nodes, { silent: true }).catch((error) => {
      console.error("IVR canvas layout autosave failed:", error);
    });
  }, [nodes, savePositions]);

  // Determine selected node type and associated data
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedType = selectedNode ? (selectedNode.data as IvrNodeData).nodeType : null;
  // Extract digit from dept-X, vm-X, sms-X, sms-ah-X, sms-post-X, ah-X patterns
  const selectedDigit = selectedNodeId?.match(/(?:dept|vm|sms-post|sms-ah|sms|ah|na|hold)-(\d+)/)?.[1] || null;
  const selectedMenuOption = selectedDigit ? menuOptions.find(o => o.digit === selectedDigit) : undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] rounded-lg border bg-background overflow-hidden">
      {testMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm font-medium">
          Test Mode - incoming calls bypass greeting and menu for direct routing tests
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <Panel position="top-right">
              <Button
                onClick={handleSaveAll}
                size="sm"
                variant={saved ? "outline" : "default"}
                className="gap-1.5 shadow-md"
              >
                {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {saved ? "Saved!" : "Save"}
              </Button>
            </Panel>
          </ReactFlow>
        </div>

        {selectedNodeId && selectedType && (
          <IvrNodeDetail
            nodeId={selectedNodeId}
            nodeType={selectedType}
            onClose={() => setSelectedNodeId(null)}
            config={config}
            menuOption={selectedMenuOption}
            profiles={profiles}
            onUpdateConfig={onUpdateConfig}
            onUpdateDept={onUpdateDept}
            onDeleteDept={(id) => { onDeleteDept(id); setSelectedNodeId(null); }}
          />
        )}
      </div>
    </div>
  );
}
