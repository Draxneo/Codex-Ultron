/**
 * OnSiteFlowCanvas — Visual flowchart of the tech's on-site Snap & Talk workflow.
 * Reflects the real photo-first, voice-memo-driven form architecture.
 * Each job type shows the actual flow techs follow in the field.
 */
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Camera, Mic, Brain, Wrench, ShoppingCart,
  MessageSquare, CheckCircle, ImagePlus, Flag, Truck,
  ClipboardCheck, HelpCircle, FileCheck, Zap
} from "lucide-react";

interface OnSiteNode {
  id: string;
  label: string;
  detail?: string;
  icon: React.ReactNode;
  type?: "step" | "decision" | "end" | "ai";
  formSection?: string;
  x: number;
  y: number;
}

const IC = "h-4 w-4";

/* ── SERVICE FLOW (Snap & Talk) ── */
function getServiceFlow(): OnSiteNode[] {
  return [
    { id: "on_my_way", label: "On My Way", detail: "Customer gets ETA text", icon: <Truck className={IC} />, x: 400, y: 0 },
    { id: "arrive", label: "Arrive On-Site", detail: "GPS confirms arrival", icon: <MapPin className={IC} />, x: 400, y: 120 },
    { id: "snap_photos", label: "Snap Photos", detail: "Data plates, before photos, gauges — AI extracts specs via OCR", icon: <Camera className={IC} />, type: "ai", x: 400, y: 240 },
    { id: "voice_memo", label: "Talk → Voice Memo", detail: "Tech describes issue — Deepgram transcribes, Gemini extracts fields", icon: <Mic className={IC} />, type: "ai", x: 400, y: 380 },
    { id: "ai_summary", label: "AI Review Card", detail: "Editable summary of extracted findings — tech confirms or corrects", icon: <Brain className={IC} />, type: "ai", x: 400, y: 520 },
    { id: "repair_decision", label: "Repair Needed?", icon: <HelpCircle className={IC} />, type: "decision", x: 400, y: 660 },
    { id: "pricebook", label: "Quick Add from Pricebook", detail: "Tap parts/services from visual grid — contactor, capacitor, motor, etc.", icon: <ShoppingCart className={IC} />, x: 150, y: 800 },
    { id: "jarvis_parts", label: "Ask JARVIS for Parts", detail: "Send photo → JARVIS finds part #, price, and texts supply house", icon: <MessageSquare className={IC} />, type: "ai", x: 150, y: 940 },
    { id: "simple_fix", label: "No Repair / Simple Fix", icon: <CheckCircle className={IC} />, x: 650, y: 800 },
    { id: "after_photos", label: "After Photos", detail: "Document completed work", icon: <ImagePlus className={IC} />, x: 400, y: 1080, formSection: "after" },
    { id: "submit", label: "Submit & Complete", detail: "Auto-advances workflow → triggers invoicing chain", icon: <Flag className={IC} />, type: "end", x: 400, y: 1220 },
  ];
}

const SERVICE_EDGES: [string, string, string?][] = [
  ["on_my_way", "arrive"],
  ["arrive", "snap_photos"],
  ["snap_photos", "voice_memo"],
  ["voice_memo", "ai_summary"],
  ["ai_summary", "repair_decision"],
  ["repair_decision", "pricebook", "Yes"],
  ["repair_decision", "simple_fix", "No"],
  ["pricebook", "jarvis_parts"],
  ["jarvis_parts", "after_photos"],
  ["simple_fix", "after_photos"],
  ["after_photos", "submit"],
];

/* ── ESTIMATE FLOW ── */
function getEstimateFlow(): OnSiteNode[] {
  return [
    { id: "on_my_way", label: "On My Way", detail: "Customer gets ETA text", icon: <Truck className={IC} />, x: 400, y: 0 },
    { id: "arrive", label: "Arrive On-Site", icon: <MapPin className={IC} />, x: 400, y: 120 },
    { id: "snap_photos", label: "Snap Photos", detail: "Data plates, existing equipment, site conditions — AI extracts specs", icon: <Camera className={IC} />, type: "ai", x: 400, y: 240 },
    { id: "voice_memo", label: "Talk → Voice Memo", detail: "Tech narrates site conditions, measurements, recommendations", icon: <Mic className={IC} />, type: "ai", x: 400, y: 380 },
    { id: "ai_summary", label: "AI Review Card", detail: "Extracted specs, measurements, and notes — tech confirms", icon: <Brain className={IC} />, type: "ai", x: 400, y: 520 },
    { id: "submit", label: "Submit & Complete", detail: "Auto-advances workflow → office builds estimate", icon: <Flag className={IC} />, type: "end", x: 400, y: 660 },
  ];
}

const ESTIMATE_EDGES: [string, string][] = [
  ["on_my_way", "arrive"], ["arrive", "snap_photos"], ["snap_photos", "voice_memo"],
  ["voice_memo", "ai_summary"], ["ai_summary", "submit"],
];

/* ── MAINTENANCE FLOW ── */
function getMaintenanceFlow(): OnSiteNode[] {
  return [
    { id: "on_my_way", label: "On My Way", detail: "Customer gets ETA text", icon: <Truck className={IC} />, x: 400, y: 0 },
    { id: "arrive", label: "Arrive On-Site", icon: <MapPin className={IC} />, x: 400, y: 120 },
    { id: "snap_photos", label: "Snap Photos", detail: "Data plates, gauges, capacitor readings — AI extracts values", icon: <Camera className={IC} />, type: "ai", x: 400, y: 240 },
    { id: "voice_memo", label: "Talk → Voice Memo", detail: "Tech narrates checklist findings and readings", icon: <Mic className={IC} />, type: "ai", x: 400, y: 380 },
    { id: "ai_summary", label: "AI Review Card", detail: "Checklist results, gauge readings, findings — tech confirms", icon: <Brain className={IC} />, type: "ai", x: 400, y: 520 },
    { id: "issues_decision", label: "Issues Found?", icon: <HelpCircle className={IC} />, type: "decision", x: 400, y: 660 },
    { id: "pricebook", label: "Quick Add Repairs", detail: "Tap recommended repairs from pricebook", icon: <ShoppingCart className={IC} />, x: 150, y: 800 },
    { id: "all_good", label: "System All Good", icon: <CheckCircle className={IC} />, x: 650, y: 800 },
    { id: "after_photos", label: "After Photos", icon: <ImagePlus className={IC} />, x: 400, y: 940, formSection: "after" },
    { id: "submit", label: "Submit & Complete", detail: "Auto-advances workflow", icon: <Flag className={IC} />, type: "end", x: 400, y: 1080 },
  ];
}

const MAINTENANCE_EDGES: [string, string, string?][] = [
  ["on_my_way", "arrive"], ["arrive", "snap_photos"], ["snap_photos", "voice_memo"],
  ["voice_memo", "ai_summary"], ["ai_summary", "issues_decision"],
  ["issues_decision", "pricebook", "Yes"],
  ["issues_decision", "all_good", "No"],
  ["pricebook", "after_photos"],
  ["all_good", "after_photos"],
  ["after_photos", "submit"],
];

/* ── INSTALL FLOW ── */
function getInstallFlow(): OnSiteNode[] {
  return [
    { id: "on_my_way", label: "On My Way", detail: "Customer gets ETA text", icon: <Truck className={IC} />, x: 400, y: 0 },
    { id: "arrive", label: "Arrive On-Site", detail: "Verify parts pickup", icon: <MapPin className={IC} />, x: 400, y: 120 },
    { id: "before_photos", label: "Before Photos & Data Plates", detail: "Old equipment — AI extracts model/serial via OCR", icon: <Camera className={IC} />, type: "ai", x: 400, y: 240 },
    { id: "install", label: "Perform Installation", icon: <Wrench className={IC} />, x: 400, y: 380 },
    { id: "new_equipment_photos", label: "New Equipment Photos", detail: "New data plates — AI extracts for warranty registration", icon: <Camera className={IC} />, type: "ai", x: 400, y: 520 },
    { id: "voice_memo", label: "Talk → Voice Memo", detail: "Tech narrates install details and any issues", icon: <Mic className={IC} />, type: "ai", x: 400, y: 660 },
    { id: "ai_summary", label: "AI Review Card", detail: "Equipment specs, install notes — tech confirms", icon: <Brain className={IC} />, type: "ai", x: 400, y: 800 },
    { id: "after_photos", label: "After Photos", icon: <ImagePlus className={IC} />, x: 400, y: 940 },
    { id: "submit", label: "Submit & Complete", detail: "Auto-advances → warranty registration, invoicing, review request", icon: <Flag className={IC} />, type: "end", x: 400, y: 1080 },
  ];
}

const INSTALL_EDGES: [string, string][] = [
  ["on_my_way", "arrive"], ["arrive", "before_photos"], ["before_photos", "install"],
  ["install", "new_equipment_photos"], ["new_equipment_photos", "voice_memo"],
  ["voice_memo", "ai_summary"], ["ai_summary", "after_photos"], ["after_photos", "submit"],
];

/* ── Flow Node Renderer ── */
function FlowNode({ data }: { data: OnSiteNode }) {
  const isDecision = data.type === "decision";
  const isEnd = data.type === "end";
  const isAI = data.type === "ai";
  return (
    <Card className={`px-4 py-3 min-w-[240px] max-w-[300px] ${
      isDecision ? "border-amber-500/50 bg-amber-500/5" :
      isEnd ? "border-primary/50 bg-primary/5" :
      isAI ? "border-emerald-500/50 bg-emerald-500/5" : ""
    }`}>
      <div className="flex items-center gap-2.5">
        <span className={`shrink-0 ${
          isDecision ? "text-amber-600" :
          isEnd ? "text-primary" :
          isAI ? "text-emerald-600" : "text-muted-foreground"
        }`}>
          {data.icon}
        </span>
        <span className="text-sm font-medium">{data.label}</span>
        {isAI && (
          <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] gap-0.5">
            <Zap className="h-2.5 w-2.5" /> AI
          </Badge>
        )}
      </div>
      {data.detail && (
        <p className="text-[10px] text-muted-foreground mt-1 ml-[30px] leading-relaxed">{data.detail}</p>
      )}
    </Card>
  );
}

const nodeTypes = { onsite: FlowNode as any };

function buildGraph(flowNodes: OnSiteNode[], edgeDefs: [string, string, string?][]) {
  const nodes = flowNodes.map(n => ({
    id: n.id,
    type: "onsite" as const,
    position: { x: n.x, y: n.y },
    data: n as any,
  })) as Node[];

  const edges: Edge[] = edgeDefs.map(([src, tgt, lbl]) => ({
    id: `e-${src}-${tgt}`,
    source: src,
    target: tgt,
    type: "smoothstep",
    animated: true,
    label: lbl || undefined,
    labelStyle: { fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" },
    labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.9 },
    labelBgPadding: [6, 4] as [number, number],
    style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
  }));

  return { nodes, edges };
}

interface Props {
  jobType: string;
}

export function OnSiteFlowCanvas({ jobType }: Props) {
  const { nodes, edges } = useMemo(() => {
    switch (jobType) {
      case "service": return buildGraph(getServiceFlow(), SERVICE_EDGES);
      case "estimate": return buildGraph(getEstimateFlow(), ESTIMATE_EDGES as any);
      case "maintenance": return buildGraph(getMaintenanceFlow(), MAINTENANCE_EDGES);
      case "install": return buildGraph(getInstallFlow(), INSTALL_EDGES as any);
      default: return { nodes: [], edges: [] };
    }
  }, [jobType]);

  if (["csr", "csr_sms", "phone_call", "ductwork"].includes(jobType)) {
    return (
      <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-muted-foreground">No On-Site Flow</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            This workflow doesn't have on-site tech steps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor="hsl(var(--primary))"
          maskColor="hsl(var(--muted) / 0.5)"
        />
      </ReactFlow>
    </div>
  );
}
