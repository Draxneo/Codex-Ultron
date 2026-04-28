import { User, Wrench, HelpCircle, Building2, Megaphone } from "lucide-react";
import { formatPhone } from "@/lib/formatters";
import { ctHeaderLabel } from "@/lib/dateGrouping";
import { cn } from "@/lib/utils";
import { SMS_CONVERSATION_STATUS_LABELS, type SmsConversation } from "@/hooks/useSmsLog";

interface Props {
  conversation: SmsConversation;
  isSelected: boolean;
  onSelect: () => void;
}

export function SmsConversationListItem({ conversation, isSelected, onSelect }: Props) {
  const { phoneNumber, contactName, contactType, status, lastMessage, unreadCount, toNumber, jobContext } = conversation;
  const Icon = contactType === "employee" ? Wrench : contactType === "marketing" ? Megaphone : contactType === "customer" ? User : contactType === "vendor" ? Building2 : HelpCircle;
  const viaLabel = toNumber ? `via ...${toNumber.replace(/\D/g, "").slice(-4)}` : null;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
      )}
    >
      <div className={cn(
        "shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
        contactType === "employee" ? "bg-primary/10 text-primary" : contactType === "marketing" ? "bg-purple-500/10 text-purple-600" : contactType === "vendor" ? "bg-orange-500/10 text-orange-600" : "bg-accent/10 text-accent-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">
            {contactName || formatPhone(phoneNumber) || phoneNumber}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
            {ctHeaderLabel(lastMessage.created_at)}
          </span>
        </div>
        {/* Show phone number under the name when we have a resolved contact name. */}
        {contactName && (
          <span className="text-[10px] text-muted-foreground/80 font-mono block">
            {formatPhone(phoneNumber) || phoneNumber}
          </span>
        )}
        {viaLabel && (
          <span className="text-[9px] text-muted-foreground/70 font-mono">{viaLabel}</span>
        )}
        <div className="flex items-center gap-1 mt-1 min-w-0">
          <span
            className={cn(
              "h-5 rounded border px-1.5 text-[10px] font-medium inline-flex items-center shrink-0",
              status === "needs_reply" && "border-destructive/30 bg-destructive/10 text-destructive",
              status === "waiting" && "border-blue-500/30 bg-blue-500/10 text-blue-700",
              status === "done" && "border-[hsl(var(--complete))]/30 bg-complete-bg text-[hsl(var(--complete))]"
            )}
          >
            {SMS_CONVERSATION_STATUS_LABELS[status]}
          </span>
          {jobContext && (
            <span className="truncate text-[10px] text-muted-foreground">
              {jobContext.label}
              {jobContext.scheduledDate ? ` - ${jobContext.scheduledDate}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {lastMessage.direction === "outbound" ? "You: " : ""}
            {lastMessage.body.slice(0, 50)}
          </p>
          {unreadCount > 0 && (
            <span className="h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1.5 shrink-0">
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
