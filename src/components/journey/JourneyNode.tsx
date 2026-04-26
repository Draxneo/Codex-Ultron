import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus, FileText, Trophy, Briefcase, Receipt, CreditCard,
  Star, RefreshCw, Wrench, Gift,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  lead: UserPlus, estimate: FileText, won: Trophy, job: Briefcase,
  invoice: Receipt, payment: CreditCard, review: Star,
  followup: RefreshCw, maintenance: Wrench, referral: Gift,
};

const ACCENT_MAP: Record<string, string> = {
  lead: "border-l-blue-500",
  estimate: "border-l-amber-500",
  won: "border-l-green-500",
  job: "border-l-indigo-500",
  invoice: "border-l-purple-500",
  payment: "border-l-emerald-500",
  review: "border-l-yellow-500",
  followup: "border-l-cyan-500",
  maintenance: "border-l-teal-500",
  referral: "border-l-pink-500",
};

const ICON_COLOR_MAP: Record<string, string> = {
  lead: "text-blue-500",
  estimate: "text-amber-500",
  won: "text-green-500",
  job: "text-indigo-500",
  invoice: "text-purple-500",
  payment: "text-emerald-500",
  review: "text-yellow-500",
  followup: "text-cyan-500",
  maintenance: "text-teal-500",
  referral: "text-pink-500",
};

export interface JourneyNodeData {
  stage: string;
  label: string;
  count: number;
  conversionRate?: number;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function JourneyNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as JourneyNodeData;
  const Icon = ICON_MAP[d.stage] || UserPlus;
  const accent = ACCENT_MAP[d.stage] || "border-l-muted-foreground";
  const iconColor = ICON_COLOR_MAP[d.stage] || "text-muted-foreground";

  return (
    <div
      className={`bg-card text-card-foreground shadow-md rounded-lg border border-l-4 ${accent} min-w-[180px] max-w-[220px] cursor-pointer hover:shadow-lg transition-all p-3 ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => d.onSelect(id)}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className="text-xs font-semibold">{d.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">{d.count} records</Badge>
        {d.conversionRate !== undefined && (
          <span className="text-[10px] text-muted-foreground">{d.conversionRate}%</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
    </div>
  );
}

export default memo(JourneyNodeComponent);
