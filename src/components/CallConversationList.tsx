import { useState } from "react";
import { Search, User, Wrench, HelpCircle, PhoneOff, ShieldCheck, ShieldAlert, ShieldX, Bot, ArrowDownLeft, ArrowUpRight, X as XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ctHeaderLabel, ctDayKey } from "@/lib/dateGrouping";
import { formatPhone } from "@/lib/formatters";
import type { CallConversation } from "@/hooks/useCallLog";

interface Props {
  conversations: CallConversation[];
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  loading: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallConversationList({ conversations, selectedPhone, onSelect, loading }: Props) {
  const [search, setSearch] = useState("");
  const [teamOpen, setTeamOpen] = useState(true);
  const [customersOpen, setCustomersOpen] = useState(true);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.phoneNumber.includes(q) || (c.contactName && c.contactName.toLowerCase().includes(q));
  });

  const team = filtered.filter((c) => c.contactType === "employee");
  const customers = filtered.filter((c) => c.contactType !== "employee");

  if (loading) {
    return (
      <div className="p-3 space-y-3 border-r bg-card h-full">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-3 space-y-2 border-b">
        <h3 className="font-semibold text-sm">Call History</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 pl-8 text-xs" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {team.length > 0 && (
          <Collapsible open={teamOpen} onOpenChange={setTeamOpen}>
            <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <Wrench className="h-3 w-3" /> Team ({team.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {team.map((c) => (
                <ConvoRow key={c.phoneNumber} convo={c} active={selectedPhone === c.phoneNumber} onClick={() => onSelect(c.phoneNumber)} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <Collapsible open={customersOpen} onOpenChange={setCustomersOpen}>
          <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <User className="h-3 w-3" /> Customers ({customers.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            {customers.map((c) => (
              <ConvoRow key={c.phoneNumber} convo={c} active={selectedPhone === c.phoneNumber} onClick={() => onSelect(c.phoneNumber)} />
            ))}
          </CollapsibleContent>
        </Collapsible>

        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No call history found</p>
        )}
      </ScrollArea>
    </div>
  );
}

function ConvoRow({ convo, active, onClick }: { convo: CallConversation; active: boolean; onClick: () => void }) {
  const last = convo.lastCall;
  const prettyPhone = formatPhone(convo.phoneNumber) || convo.phoneNumber;
  const initials = convo.contactName
    ? convo.contactName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
    : null;

  const renderDirectionIcon = () => {
    if (last.status === "suspected-bot") return <Bot className="h-3 w-3 text-muted-foreground" />;
    if (["no-answer", "busy", "failed", "canceled", "missed-while-busy", "unknown"].includes(last.status)) {
      return <XIcon className="h-3 w-3 text-destructive" />;
    }
    if (last.status === "completed") {
      return last.direction === "inbound"
        ? <ArrowDownLeft className="h-3 w-3 text-[hsl(var(--success))]" />
        : <ArrowUpRight className="h-3 w-3 text-primary" />;
    }
    return <PhoneOff className="h-3 w-3 text-muted-foreground" />;
  };

  const directionLabel = last.status === "suspected-bot"
    ? "Bot"
    : last.status === "completed"
      ? (last.direction === "inbound" ? "Answered" : "Outbound")
      : last.status === "no-answer" ? "Missed"
      : last.status;

  // Timestamp color: today = foreground, within week = muted, older = muted/60
  const now = new Date();
  const todayKey = ctDayKey(now);
  const callKey = ctDayKey(last.created_at);
  const msDiff = now.getTime() - new Date(last.created_at).getTime();
  const daysDiff = Math.floor(msDiff / (24 * 60 * 60 * 1000));
  const tsColor = callKey === todayKey
    ? "text-foreground"
    : daysDiff < 7
      ? "text-muted-foreground"
      : "text-muted-foreground/60";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/40",
        active && "bg-muted"
      )}
    >
      <div className={cn(
        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-semibold",
        convo.contactType === "employee"
          ? "bg-primary/10 text-primary"
          : initials
            ? "bg-accent/15 text-accent-foreground"
            : "bg-muted text-muted-foreground"
      )}>
        {convo.contactType === "employee" ? (
          <Wrench className="h-4 w-4" />
        ) : initials ? (
          <span className="tracking-wide">{initials}</span>
        ) : (
          <HelpCircle className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">
            {convo.contactName || prettyPhone}
          </span>
          <span className={cn("text-[10px] flex-shrink-0 whitespace-nowrap", tsColor)}>
            {ctHeaderLabel(last.created_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate" title={directionLabel}>
            <span className="inline-flex items-center gap-1 shrink-0">{renderDirectionIcon()}</span>
            <span className="truncate">
              {directionLabel}
              {last.duration_seconds ? ` · ${formatDuration(last.duration_seconds)}` : ""}
            </span>
            {last.direction === "inbound" && last.stir_status && <StirBadge status={last.stir_status} />}
          </div>
          {convo.unreadCount > 0 && (
            <span className="flex-shrink-0 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1">
              {convo.unreadCount}
            </span>
          )}
        </div>
        {convo.contactName && (
          <p className="text-[10px] text-muted-foreground/60 tabular-nums">{prettyPhone}</p>
        )}
      </div>
    </button>
  );
}

function StirBadge({ status }: { status: string }) {
  if (status === "A" || status === "B") {
    return (
      <span title={`Verified (${status})`} className="flex-shrink-0">
        <ShieldCheck className="h-3 w-3 text-[hsl(var(--success))]" />
      </span>
    );
  }
  if (status === "C" || status === "none" || status === "unknown") {
    return (
      <span title={`Unverified (${status})`} className="flex-shrink-0">
        <ShieldAlert className="h-3 w-3 text-[hsl(var(--warning,40_100%_50%))]" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span title="Spam blocked" className="flex-shrink-0">
        <ShieldX className="h-3 w-3 text-destructive" />
      </span>
    );
  }
  return null;
}