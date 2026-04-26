import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Clock, MessageSquare, Mail, Brain, GitBranch, CircleStop,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  trigger: Zap, delay: Clock, send_sms: MessageSquare,
  send_email: Mail, ai_check: Brain, branch: GitBranch, end: CircleStop,
};

const ACCENT_MAP: Record<string, string> = {
  trigger: "border-l-amber-500",
  delay: "border-l-blue-500",
  send_sms: "border-l-green-500",
  send_email: "border-l-purple-500",
  ai_check: "border-l-violet-500",
  branch: "border-l-orange-500",
  end: "border-l-red-500",
};

const ICON_COLOR_MAP: Record<string, string> = {
  trigger: "text-amber-500",
  delay: "text-blue-500",
  send_sms: "text-green-500",
  send_email: "text-purple-500",
  ai_check: "text-violet-500",
  branch: "text-orange-500",
  end: "text-red-500",
};

export interface SequenceNodeData {
  stepType: string;
  label: string;
  config: Record<string, any>;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function SequenceNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as SequenceNodeData;
  const Icon = ICON_MAP[d.stepType] || Zap;
  const accent = ACCENT_MAP[d.stepType] || "border-l-muted-foreground";
  const iconColor = ICON_COLOR_MAP[d.stepType] || "text-muted-foreground";

  return (
    <div
      className={`bg-card text-card-foreground shadow-md rounded-lg border border-l-4 ${accent} min-w-[180px] max-w-[220px] cursor-pointer hover:shadow-lg transition-all p-3 ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => d.onSelect(id)}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className="text-xs font-semibold truncate">{d.label}</span>
      </div>
      <Badge variant="secondary" className="text-[10px]">
        {d.stepType.replace("_", " ")}
      </Badge>
      {d.stepType === "delay" && d.config?.duration && (
        <p className="text-[10px] text-muted-foreground mt-1">{d.config.duration} {d.config.unit || "hours"}</p>
      )}
      {d.stepType === "send_sms" && d.config?.templateName && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{d.config.templateName}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
    </div>
  );
}

export default memo(SequenceNodeComponent);
