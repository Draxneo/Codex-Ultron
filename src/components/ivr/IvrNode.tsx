/**
 * IvrNode — Custom React Flow node for IVR flow steps.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  Phone, PhoneIncoming, PhoneForwarded, Calendar, MessageSquare,
  Voicemail, Moon, Power, Users, Clock, GitBranch, UserCheck, UserPlus, PhoneMissed, Headset, Music
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  incoming: <PhoneIncoming className="h-4 w-4" />,
  holiday: <Calendar className="h-4 w-4" />,
  greeting: <Phone className="h-4 w-4" />,
  department: <PhoneForwarded className="h-4 w-4" />,
  no_answer: <PhoneMissed className="h-4 w-4" />,
  voicemail: <Voicemail className="h-4 w-4" />,
  after_hours: <Moon className="h-4 w-4" />,
  hangup: <Power className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  post_call_check: <GitBranch className="h-4 w-4" />,
  post_call_customer: <UserCheck className="h-4 w-4" />,
  post_call_unknown: <UserPlus className="h-4 w-4" />,
  overflow: <Headset className="h-4 w-4" />,
  missed_call_master: <PhoneMissed className="h-4 w-4" />,
  hold_music: <Music className="h-4 w-4" />,
};

export interface IvrNodeData extends Record<string, unknown> {
  nodeType: "incoming" | "holiday" | "greeting" | "department" | "no_answer" | "voicemail" | "after_hours" | "hangup" | "sms" | "post_call_check" | "post_call_customer" | "post_call_unknown" | "overflow" | "missed_call_master" | "hold_music";
  label: string;
  subtitle?: string;
  digit?: string;
  actionType?: string;
  hoursLabel?: string;
  assignedCount?: number;
  onSelect?: (id: string) => void;
}

function IvrNodeComponent({ id, data, selected }: NodeProps & { data: IvrNodeData }) {
  const d = data as IvrNodeData;
  const isTerminal = d.nodeType === "hangup" || d.nodeType === "post_call_customer" || d.nodeType === "post_call_unknown";
  const hasSourceHandle = !isTerminal && d.nodeType !== "incoming";
  const isEntry = d.nodeType === "incoming";
  const isSms = d.nodeType === "sms";

  const actionLabel = d.actionType === "forward_client" ? "Softphone"
    : d.actionType === "forward_phone" ? "Forward"
    : d.actionType === "say_message" ? "Message" : null;

  return (
    <>
      {!isEntry && (
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      )}

      <div
        onClick={() => d.onSelect?.(id)}
        className={`
          min-w-[180px] max-w-[240px] rounded-lg border bg-card text-card-foreground shadow-md
          cursor-pointer transition-all hover:shadow-lg
          ${selected ? "ring-2 ring-primary border-primary" : "border-border"}
          ${d.nodeType === "post_call_check" ? "border-purple-400/60 bg-purple-50/50 dark:bg-purple-950/20" : ""}
          ${d.nodeType === "post_call_customer" ? "border-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
          ${d.nodeType === "post_call_unknown" ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20" : ""}
          ${d.nodeType === "overflow" ? "border-cyan-400/70 bg-cyan-50/60 dark:bg-cyan-950/20 ring-1 ring-cyan-300/40" : ""}
          ${d.nodeType === "hold_music" ? "border-violet-400/70 bg-violet-50/60 dark:bg-violet-950/20 ring-1 ring-violet-300/40" : ""}
          ${d.nodeType === "missed_call_master" ? "border-rose-400/70 bg-rose-50/60 dark:bg-rose-950/20 ring-1 ring-rose-300/40" : ""}
          ${isSms && d.nodeType === "sms" ? "border-blue-400/60 bg-blue-50/50 dark:bg-blue-950/20" : d.nodeType === "no_answer" ? "border-orange-400/60 bg-orange-50/50 dark:bg-orange-950/20" : (d.nodeType === "voicemail" || d.nodeType === "hangup") ? "border-dashed opacity-80" : ""}
        `}
      >
        <div className="px-3 py-2.5 flex items-start gap-2">
          <div className={`mt-0.5 shrink-0 ${d.nodeType === "department" ? "text-primary" : "text-muted-foreground"}`}>
            {ICON_MAP[d.nodeType] || <Phone className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {d.digit && (
                <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                  {d.digit}
                </span>
              )}
              <p className="text-xs font-semibold leading-tight">{d.label}</p>
            </div>
            {d.subtitle && (
              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{d.subtitle}</p>
            )}
          </div>
        </div>

        {(actionLabel || d.hoursLabel || (d.assignedCount !== undefined && d.assignedCount > 0)) && (
          <div className="px-3 pb-2 flex flex-wrap gap-1">
            {actionLabel && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{actionLabel}</Badge>
            )}
            {d.hoursLabel && (
              <Badge className="text-[9px] h-4 px-1.5 bg-blue-500/15 text-blue-700 border-blue-300">
                <Clock className="h-2.5 w-2.5 mr-0.5" />{d.hoursLabel}
              </Badge>
            )}
            {d.assignedCount !== undefined && d.assignedCount > 0 && (
              <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/15 text-emerald-700 border-emerald-300">
                <Users className="h-2.5 w-2.5 mr-0.5" />{d.assignedCount}
              </Badge>
            )}
          </div>
        )}
      </div>

      {!isTerminal && (
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      )}
    </>
  );
}

export default memo(IvrNodeComponent);
