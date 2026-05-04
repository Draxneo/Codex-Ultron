import { useState } from "react";
import { Search, Plus, User, Wrench, HelpCircle, Building2, Megaphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ctHeaderLabel } from "@/lib/dateGrouping";
import { formatPhone } from "@/lib/formatters";
import type { SmsConversation } from "@/hooks/useSmsLog";

interface Props {
  conversations: SmsConversation[];
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  onNewMessage: () => void;
}

export function SmsConversationList({ conversations, selectedPhone, onSelect, onNewMessage }: Props) {
  const [search, setSearch] = useState("");
  const [teamOpen, setTeamOpen] = useState(true);
  const [marketingOpen, setMarketingOpen] = useState(true);
  const [customersOpen, setCustomersOpen] = useState(true);
  const [externalOpen, setExternalOpen] = useState(true);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.phoneNumber.includes(q) ||
      (c.contactName && c.contactName.toLowerCase().includes(q))
    );
  });

  const team = filtered.filter((c) => c.contactType === "employee");
  const marketing = filtered.filter((c) => c.contactType === "marketing");
  const external = filtered.filter((c) => c.contactType === "vendor");
  const customers = filtered.filter((c) => !["employee", "marketing", "vendor"].includes(c.contactType));

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-3 space-y-2 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Conversations</h3>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onNewMessage}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-xs"
          />
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
                <ConversationRow key={c.phoneNumber} convo={c} active={selectedPhone === c.phoneNumber} onClick={() => onSelect(c.phoneNumber)} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {marketing.length > 0 && (
          <Collapsible open={marketingOpen} onOpenChange={setMarketingOpen}>
            <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <Megaphone className="h-3 w-3" /> Marketing ({marketing.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {marketing.map((c) => (
                <ConversationRow key={c.phoneNumber} convo={c} active={selectedPhone === c.phoneNumber} onClick={() => onSelect(c.phoneNumber)} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {external.length > 0 && (
          <Collapsible open={externalOpen} onOpenChange={setExternalOpen}>
            <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <Building2 className="h-3 w-3" /> External ({external.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {external.map((c) => (
                <ConversationRow key={c.phoneNumber} convo={c} active={selectedPhone === c.phoneNumber} onClick={() => onSelect(c.phoneNumber)} />
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
              <ConversationRow key={c.phoneNumber} convo={c} active={selectedPhone === c.phoneNumber} onClick={() => onSelect(c.phoneNumber)} />
            ))}
          </CollapsibleContent>
        </Collapsible>

        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No conversations found</p>
        )}
      </ScrollArea>
    </div>
  );
}

function ConversationRow({ convo, active, onClick }: { convo: SmsConversation; active: boolean; onClick: () => void }) {
  const icon = convo.contactType === "employee" ? Wrench : convo.contactType === "marketing" ? Megaphone : convo.contactType === "customer" ? User : convo.contactType === "vendor" ? Building2 : HelpCircle;
  const Icon = icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        active && "bg-muted"
      )}
    >
      <div className={cn(
        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs",
        convo.contactType === "employee" ? "bg-primary/10 text-primary" : convo.contactType === "marketing" ? "bg-purple-500/10 text-purple-600" : convo.contactType === "vendor" ? "bg-orange-500/10 text-orange-600" : "bg-accent/10 text-accent-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">
            {convo.contactName || formatPhone(convo.phoneNumber) || convo.phoneNumber}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1 whitespace-nowrap">
            {ctHeaderLabel(convo.lastMessage.created_at)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate">
            {convo.lastMessage.direction === "outbound" ? "You: " : ""}
            {convo.lastMessage.body.slice(0, 60)}
          </p>
          {convo.unreadCount > 0 && (
            <span className="flex-shrink-0 ml-1 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1">
              {convo.unreadCount}
            </span>
          )}
        </div>
        {convo.contactName && (
          <p className="text-[10px] text-muted-foreground/60">{formatPhone(convo.phoneNumber) || convo.phoneNumber}</p>
        )}
      </div>
    </button>
  );
}
