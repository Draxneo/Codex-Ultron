import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Wrench, Search, Clock, Route, Bot,
  MessageSquare, Mail, FileText, Calendar, DollarSign, StickyNote,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  orchestrator: Brain,
  repair_quote: Wrench,
  parts_scraper: Search,
  follow_up: Clock,
  scheduling: Calendar,
  communications: MessageSquare,
  email: Mail,
  sales_docs: FileText,
  invoicing: DollarSign,
};

const STATUS_STYLES: Record<string, { border: string; badge: string; badgeLabel: string }> = {
  active: { border: "border-l-emerald-500", badge: "bg-emerald-500/10 text-emerald-600", badgeLabel: "Active" },
  planned: { border: "border-l-amber-500", badge: "bg-amber-500/10 text-amber-600", badgeLabel: "Planned" },
  disabled: { border: "border-l-muted-foreground/40", badge: "bg-muted text-muted-foreground", badgeLabel: "Disabled" },
};

export interface AgentNodeData {
  name: string;
  label: string;
  description: string;
  status: string;
  edge_function: string | null;
  toolCount: number;
  triggers: string[];
  type: string;
  notes: string | null;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function AgentNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as AgentNodeData;

  // Annotation node — sticky note style
  if (d.type === "annotation") {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md shadow-sm max-w-[220px] p-2.5 text-[10px] leading-relaxed text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-1 mb-1 font-semibold text-[11px]">
          <StickyNote className="h-3 w-3" />
          {d.label}
        </div>
        {d.notes && <p className="whitespace-pre-wrap">{d.notes}</p>}
      </div>
    );
  }

  const Icon = ICON_MAP[d.name] || Bot;
  const style = STATUS_STYLES[d.status] || STATUS_STYLES.planned;

  return (
    <div
      className={`bg-card text-card-foreground shadow-md rounded-lg border border-l-4 ${style.border} min-w-[220px] max-w-[260px] cursor-pointer hover:shadow-lg transition-all p-3 ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => d.onSelect(id)}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-xs font-semibold flex-1">{d.label}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.badgeLabel}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 mb-1.5">{d.description}</p>
      <div className="flex items-center gap-1.5">
        {d.toolCount > 0 && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{d.toolCount} tools</Badge>
        )}
        {d.edge_function && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono">{d.edge_function}</Badge>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
    </div>
  );
}

export default memo(AgentNodeComponent);
