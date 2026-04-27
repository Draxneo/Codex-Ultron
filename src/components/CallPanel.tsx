import { useState } from "react";
import { Search, User, Wrench, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCallLog, type CallConversation } from "@/hooks/useCallLog";
import { CallContactCard } from "@/components/CallContactCard";
import { DayDivider } from "@/components/shared/DayDivider";
import { groupByDay } from "@/lib/dateGrouping";

export function CallPanel({ hideBots = false }: { hideBots?: boolean } = {}) {
  const { conversations, loading, markAsRead } = useCallLog();
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"customers" | "team" | "external">("customers");

  const filtered = conversations.filter((c) => {
    // Suspected-bot filter: a caller whose LAST inbound attempt was classified
    // as a bot (didn't press 1 or 2 in the IVR). We only hide the conversation
    // if EVERY call with them is a suspected-bot — otherwise a real follow-up
    // call would disappear too.
    if (hideBots && c.calls.every((call) => call.status === "suspected-bot")) {
      return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return c.phoneNumber.includes(q) || (c.contactName && c.contactName.toLowerCase().includes(q));
  });

  const team = filtered.filter((c) => c.contactType === "employee");
  // Marketing/ad-agency contacts are grouped under Vendors (external B2B) — same as SMS panel
  const external = filtered.filter(
    (c) => c.contactType === "vendor" || c.contactType === "marketing"
  );
  const customers = filtered.filter(
    (c) => !["employee", "vendor", "marketing"].includes(c.contactType)
  );

  const sumUnread = (list: CallConversation[]) =>
    list.reduce((s, c) => s + (c.unreadCount || 0), 0);
  const teamUnread = sumUnread(team);
  const externalUnread = sumUnread(external);
  const customersUnread = sumUnread(customers);

  if (loading) {
    return (
      <div className="p-4 space-y-3 max-w-3xl mx-auto">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  const toggleCard = (phone: string) => {
    setExpandedPhone((prev) => (prev === phone ? null : phone));
  };

  const renderGroupedCards = (list: CallConversation[]) => {
    if (list.length === 0) {
      return (
        <p className="text-xs text-muted-foreground text-center py-8">
          No {activeTab} calls
        </p>
      );
    }
    const groups = groupByDay(
      list,
      (c) => c.lastCall.created_at,
      (c) => (c.lastCall as any).day_ct,
    );
    return groups.map((group) => (
      <div key={group.key} className="space-y-1.5">
        <DayDivider label={group.label} className="my-1" />
        {group.items.map((c) => (
          <CallContactCard
            key={c.phoneNumber}
            conversation={c}
            isExpanded={expandedPhone === c.phoneNumber}
            onToggle={() => toggleCard(c.phoneNumber)}
            onMarkRead={markAsRead}
          />
        ))}
      </div>
    ));
  };

  const activeList =
    activeTab === "customers" ? customers : activeTab === "team" ? team : external;

  return (
    <div className="h-full flex flex-col">
      <div className="max-w-3xl mx-auto w-full px-4 pt-4 pb-2 space-y-3 shrink-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search calls..."
            className="pl-9 h-9 rounded-lg shadow-sm"
          />
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "customers" | "team" | "external")}
        >
          <TabsList className="grid grid-cols-3 h-8 w-full">
            <CallTabTrigger
              value="customers"
              icon={<User className="h-3 w-3" />}
              label="Customers"
              count={customers.length}
              unread={customersUnread}
            />
            <CallTabTrigger
              value="team"
              icon={<Wrench className="h-3 w-3" />}
              label="Team"
              count={team.length}
              unread={teamUnread}
            />
            <CallTabTrigger
              value="external"
              icon={<Building2 className="h-3 w-3" />}
              label="External"
              count={external.length}
              unread={externalUnread}
            />
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-3xl mx-auto p-4 pt-1 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No call history found
            </p>
          ) : (
            renderGroupedCards(activeList)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function CallTabTrigger({
  value,
  icon,
  label,
  count,
  unread,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  unread: number;
}) {
  return (
    <TabsTrigger value={value} className="relative gap-1 text-[11px] px-1">
      {icon}
      <span>{label}</span>
      <span className="text-muted-foreground/70">({count})</span>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </TabsTrigger>
  );
}
