/**
 * FormDesignerPreview — Visual preview of the Snap & Talk tech form.
 * Shows the actual mobile-first flow techs see: photo grid, voice memo,
 * AI extraction card, and pricebook. Also renders the CSR call flow.
 */
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Camera, Mic, Brain, Zap, ShoppingCart, Eye, Snowflake, Flame,
  MapPin, Phone, Search, HelpCircle, CheckCircle, ClipboardList,
  FileCheck, User, Mail, Send, Calendar, Flag, ImagePlus, Wrench, MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { getDefaultSteps } from "@/hooks/useWorkflowDefinitions";

interface Props {
  jobType: string;
}

/* ── CSR Flow Node (kept from original) ── */
function CsrFlowNode({ data }: { data: { label: string; icon: React.ReactNode; type?: string; detail?: string } }) {
  const isDecision = data.type === "decision";
  const isEnd = data.type === "end";
  return (
    <Card className={cn(
      "px-4 py-3 min-w-[220px] max-w-[260px]",
      isDecision && "border-amber-500/50 bg-amber-500/5",
      isEnd && "border-primary/50 bg-primary/5",
    )}>
      <div className="flex items-center gap-2.5">
        <span className={cn("shrink-0", isDecision ? "text-amber-600" : isEnd ? "text-primary" : "text-muted-foreground")}>
          {data.icon}
        </span>
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      {data.detail && (
        <p className="text-[11px] text-muted-foreground mt-1 ml-6.5">{data.detail}</p>
      )}
    </Card>
  );
}

const csrNodeTypes = { csrNode: CsrFlowNode as any };

export function FormDesignerPreview({ jobType }: Props) {
  const [season, setSeason] = useState<"cooling" | "heating">("cooling");

  /* ── CSR Call Flow (unchanged) ── */
  const csrGraph = useMemo(() => {
    if (jobType !== "csr") return null;
    const IC = "h-4 w-4";
    interface CsrNode { id: string; label: string; icon: React.ReactNode; type?: "step" | "decision" | "end"; detail?: string; x: number; y: number; }
    const flowNodes: CsrNode[] = [
      { id: "new_or_returning", label: "New or Returning?", icon: <HelpCircle className={IC} />, type: "decision", detail: "Auto-pop from caller ID. If no match, ask caller.", x: 400, y: 0 },
      { id: "search", label: "Customer Lookup", icon: <Search className={IC} />, detail: "Search by name, phone, address, email", x: 650, y: 120 },
      { id: "found_decision", label: "Customer Found?", icon: <HelpCircle className={IC} />, type: "decision", x: 650, y: 240 },
      { id: "matched", label: "Link Existing Customer", icon: <CheckCircle className={IC} />, detail: "Customer record linked to this call", x: 850, y: 360 },
      { id: "problem_returning", label: "Describe Problem", icon: <ClipboardList className={IC} />, detail: "What's happening, how long, which unit", x: 850, y: 500 },
      { id: "service_type", label: "Residential or Commercial?", icon: <HelpCircle className={IC} />, type: "decision", detail: "Determines routing and pricing tier", x: 400, y: 240 },
      { id: "name", label: "Collect Name", icon: <User className={IC} />, detail: "First name + Last name", x: 400, y: 380 },
      { id: "address", label: "Service Address", icon: <MapPin className={IC} />, detail: "Address autocomplete for accurate dispatching", x: 400, y: 500 },
      { id: "phone", label: "Phone Number", icon: <Phone className={IC} />, detail: "Primary contact number", x: 400, y: 620 },
      { id: "email", label: "Email (optional)", icon: <Mail className={IC} />, detail: "For estimates and invoices", x: 400, y: 740 },
      { id: "ownership", label: "Own Home or Rental?", icon: <HelpCircle className={IC} />, type: "decision", detail: "Affects billing and tenant coordination", x: 400, y: 860 },
      { id: "tenant", label: "Tenant Contact Info", icon: <User className={IC} />, detail: "Tenant name + phone for day-of access", x: 150, y: 980 },
      { id: "alt_contact", label: "Alt Day-of Contact", icon: <Phone className={IC} />, detail: "'Will you be there, or should we contact someone else?'", x: 400, y: 1100 },
      { id: "send_intake", label: "Text Intake Link", icon: <Send className={IC} />, detail: "Self-service form URL sent via SMS", x: 400, y: 1220 },
      { id: "problem", label: "Describe Problem", icon: <ClipboardList className={IC} />, detail: "What's happening, how long, which unit", x: 400, y: 1340 },
      { id: "schedule", label: "Schedule / Create Job", icon: <Calendar className={IC} />, type: "end", detail: "Book appointment or create estimate", x: 400, y: 1460 },
      { id: "schedule_returning", label: "Schedule / Create Job", icon: <Calendar className={IC} />, type: "end", detail: "Book appointment for returning customer", x: 850, y: 640 },
    ];
    const edgeDefs: [string, string, string?][] = [
      ["new_or_returning", "service_type", "New"],
      ["new_or_returning", "search", "Returning"],
      ["search", "found_decision"],
      ["found_decision", "matched", "Yes"],
      ["found_decision", "service_type", "No — Create New"],
      ["matched", "problem_returning"],
      ["problem_returning", "schedule_returning"],
      ["service_type", "name", "Residential"],
      ["service_type", "name", "Commercial"],
      ["name", "address"],
      ["address", "phone"],
      ["phone", "email"],
      ["email", "ownership"],
      ["ownership", "tenant", "Rental"],
      ["ownership", "alt_contact", "Own Home"],
      ["tenant", "alt_contact"],
      ["alt_contact", "send_intake"],
      ["send_intake", "problem"],
      ["problem", "schedule"],
    ];
    const nodes: Node[] = flowNodes.map(n => ({
      id: n.id,
      type: "csrNode" as const,
      position: { x: n.x, y: n.y },
      data: n as any,
    }));
    const edges: Edge[] = edgeDefs.map(([src, tgt, lbl], i) => ({
      id: `e-${src}-${tgt}-${i}`,
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
  }, [jobType]);

  if (jobType === "csr" && csrGraph) {
    return (
      <div className="h-[calc(100vh-220px)] min-h-[500px] rounded-lg border bg-card overflow-hidden">
        <ReactFlow
          nodes={csrGraph.nodes}
          edges={csrGraph.edges}
          nodeTypes={csrNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/30" />
          <Controls className="!bg-card !border-border !shadow-sm" />
          <MiniMap className="!bg-card !border-border" nodeColor="hsl(var(--primary))" maskColor="hsl(var(--muted) / 0.5)" />
        </ReactFlow>
      </div>
    );
  }

  /* ── Snap & Talk Preview for field job types ── */
  const isFieldJob = ["service", "maintenance", "install", "estimate"].includes(jobType);

  if (!isFieldJob) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No form preview available for this workflow type.
      </div>
    );
  }

  const photoTypes = jobType === "install"
    ? ["Data Plate (Old)", "Before Photos", "Data Plate (New)", "After Photos"]
    : jobType === "estimate"
    ? ["Data Plate", "Site Photos", "Existing Equipment"]
    : jobType === "maintenance"
    ? ["Data Plate", "Gauge Readings", "Capacitor", "Filter"]
    : ["Data Plate", "Before Photos", "Gauge/Multimeter", "After Photos"];

  return (
    <div className="space-y-4">
      {/* Season toggle for maintenance */}
      {jobType === "maintenance" && (
        <div className="flex items-center justify-between bg-muted/50 rounded-lg border px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-4 w-4" />
            <span className="font-medium">Season Preview</span>
          </div>
          <ToggleGroup
            type="single"
            value={season}
            onValueChange={(v) => v && setSeason(v as "cooling" | "heating")}
            className="bg-background rounded-lg border p-0.5"
          >
            <ToggleGroupItem value="cooling" className="text-xs gap-1.5 px-3 h-7 rounded-md data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-800">
              <Snowflake className="h-3.5 w-3.5" /> Cooling
            </ToggleGroupItem>
            <ToggleGroupItem value="heating" className="text-xs gap-1.5 px-3 h-7 rounded-md data-[state=on]:bg-amber-100 data-[state=on]:text-amber-800">
              <Flame className="h-3.5 w-3.5" /> Heating
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* Mobile phone frame */}
      <div className="mx-auto max-w-[420px] border-2 border-border rounded-[2rem] bg-background shadow-xl overflow-hidden">
        {/* Phone status bar */}
        <div className="bg-muted/50 px-6 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-2 border border-muted-foreground/40 rounded-sm relative">
              <div className="absolute inset-0.5 bg-emerald-500 rounded-[1px]" style={{ width: "70%" }} />
            </div>
          </div>
        </div>

        {/* Form header */}
        <div className="bg-primary text-primary-foreground px-4 py-3">
          <p className="text-xs font-medium opacity-80 capitalize">{jobType} Form</p>
          <p className="text-sm font-bold">Snap & Talk</p>
        </div>

        {/* Step 1: Photo Grid */}
        <div className="px-4 py-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
            <h3 className="text-sm font-semibold">Snap Photos</h3>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] gap-0.5 ml-auto">
              <Zap className="h-2.5 w-2.5" /> AI OCR
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {photoTypes.map((label) => (
              <div key={label} className="border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center gap-1.5 p-4 bg-muted/10">
                <Camera className="h-6 w-6 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground text-center">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            AI automatically extracts model #, serial #, brand, readings from photos
          </p>
        </div>

        {/* Step 2: Voice Memo */}
        <div className="px-4 py-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
            <h3 className="text-sm font-semibold">Talk — Voice Memo</h3>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] gap-0.5 ml-auto">
              <Zap className="h-2.5 w-2.5" /> Deepgram + Gemini
            </Badge>
          </div>
          <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <Mic className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Tap to record</p>
              <p className="text-[10px] text-muted-foreground">
                Describe what you found — AI fills out the form for you
              </p>
            </div>
          </div>
        </div>

        {/* Step 3: AI Summary */}
        <div className="px-4 py-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</div>
            <h3 className="text-sm font-semibold">AI Review Card</h3>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] gap-0.5 ml-auto">
              <Brain className="h-2.5 w-2.5" /> Auto-filled
            </Badge>
          </div>
          <Card className="border-emerald-200 bg-emerald-50/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-800">Extracted Summary</span>
              <Badge variant="outline" className="text-[9px]">Editable</Badge>
            </div>
            <div className="space-y-1.5">
              {["Model: GSX160361FA", "Serial: 1234567890", "Issue: Capacitor reading low at 28µF (rated 35µF)", "Recommendation: Replace capacitor"].map(line => (
                <p key={line} className="text-[11px] text-muted-foreground bg-background rounded px-2 py-1">{line}</p>
              ))}
            </div>
          </Card>
        </div>

        {/* Step 4: Pricebook (service/maintenance only) */}
        {["service", "maintenance"].includes(jobType) && (
          <div className="px-4 py-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-accent text-accent-foreground text-xs font-bold">4</div>
              <h3 className="text-sm font-semibold">Quick Add Repairs</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { emoji: "⚡", name: "Contactor", price: "$250" },
                { emoji: "⚡", name: "Capacitor", price: "$200" },
                { emoji: "🔧", name: "Fan Motor", price: "$550" },
              ].map(item => (
                <div key={item.name} className="border rounded-xl p-3 flex flex-col items-center gap-1 bg-card">
                  <span className="text-xl">{item.emoji}</span>
                  <span className="text-[10px] font-medium text-center">{item.name}</span>
                  <span className="text-xs font-bold text-primary">{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JARVIS + Pricebook FABs */}
        <div className="px-4 py-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Always Available</p>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 bg-accent/10 rounded-xl px-4 py-3 flex-1">
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                <Wrench className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold">Pricebook</p>
                <p className="text-[10px] text-muted-foreground">Tap to add parts</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-4 py-3 flex-1">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold">JARVIS</p>
                <p className="text-[10px] text-muted-foreground">Find parts, get help</p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="px-4 pb-6 pt-2">
          <Button className="w-full h-12 text-base font-semibold" disabled>
            <Flag className="h-4 w-4 mr-2" />
            Submit {jobType === "estimate" ? "Estimate" : "Completion"}
          </Button>
        </div>

        {/* Home bar */}
        <div className="flex justify-center pb-2">
          <div className="w-32 h-1 bg-muted-foreground/20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
