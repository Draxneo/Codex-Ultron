import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Send, Link2, CreditCard, CheckCircle, XCircle,
  RefreshCw, AlertTriangle, Mail, Scale,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  created: FileText, sent: Send, link: Link2, attempted: CreditCard,
  succeeded: CheckCircle, failed: XCircle, retry: RefreshCw,
  overdue: AlertTriangle, receipt: Mail, collection: Scale,
};

const ACCENT_MAP: Record<string, string> = {
  created: "border-l-slate-500",
  sent: "border-l-blue-500",
  link: "border-l-indigo-500",
  attempted: "border-l-amber-500",
  succeeded: "border-l-green-500",
  failed: "border-l-red-500",
  retry: "border-l-orange-500",
  overdue: "border-l-rose-500",
  receipt: "border-l-emerald-500",
  collection: "border-l-purple-500",
};

const ICON_COLOR_MAP: Record<string, string> = {
  created: "text-slate-500",
  sent: "text-blue-500",
  link: "text-indigo-500",
  attempted: "text-amber-500",
  succeeded: "text-green-500",
  failed: "text-red-500",
  retry: "text-orange-500",
  overdue: "text-rose-500",
  receipt: "text-emerald-500",
  collection: "text-purple-500",
};

export interface PaymentFlowNodeData {
  stage: string;
  label: string;
  count: number;
  amount?: number;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function PaymentFlowNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as PaymentFlowNodeData;
  const Icon = ICON_MAP[d.stage] || FileText;
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
        <Badge variant="secondary" className="text-[10px]">{d.count}</Badge>
        {d.amount !== undefined && d.amount > 0 && (
          <span className="text-[10px] font-medium text-green-600 dark:text-green-400">
            ${d.amount.toLocaleString()}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
    </div>
  );
}

export default memo(PaymentFlowNodeComponent);
