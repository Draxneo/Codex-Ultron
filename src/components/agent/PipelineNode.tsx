import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Database, FileText, Wrench, Cpu, Send, RefreshCw,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  input: MessageSquare, context: Database, instructions: FileText,
  tools: Wrench, model: Cpu, output: Send, learning: RefreshCw,
};

const ACCENT_MAP: Record<string, string> = {
  input: "border-l-blue-500",
  context: "border-l-amber-500",
  instructions: "border-l-green-500",
  tools: "border-l-indigo-500",
  model: "border-l-violet-500",
  output: "border-l-emerald-500",
  learning: "border-l-orange-500",
};

const ICON_COLOR_MAP: Record<string, string> = {
  input: "text-blue-500",
  context: "text-amber-500",
  instructions: "text-green-500",
  tools: "text-indigo-500",
  model: "text-violet-500",
  output: "text-emerald-500",
  learning: "text-orange-500",
};

export interface PipelineNodeData {
  stage: string;
  label: string;
  detail: string;
  count?: number;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function PipelineNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as PipelineNodeData;
  const Icon = ICON_MAP[d.stage] || MessageSquare;
  const accent = ACCENT_MAP[d.stage] || "border-l-muted-foreground";
  const iconColor = ICON_COLOR_MAP[d.stage] || "text-muted-foreground";

  return (
    <div
      className={`bg-card text-card-foreground shadow-md rounded-lg border border-l-4 ${accent} min-w-[200px] max-w-[240px] cursor-pointer hover:shadow-lg transition-all p-3 ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => d.onSelect(id)}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className="text-xs font-semibold">{d.label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{d.detail}</p>
      {d.count !== undefined && (
        <Badge variant="secondary" className="text-[10px] mt-1.5">{d.count} active</Badge>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
    </div>
  );
}

export default memo(PipelineNodeComponent);
