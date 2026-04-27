import { useState, useEffect } from "react";
import { Search, Plus, User, Wrench, MessageSquare, Building2 } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { SmsContactCard } from "@/components/SmsContactCard";
import { SmsThreadView } from "@/components/SmsThreadView";
import { SmsConversationListItem } from "@/components/SmsConversationListItem";
import { cn } from "@/lib/utils";
import { toE164, normalizeLast10 } from "@/lib/formatters";

interface SmsPanelProps {
  compact?: boolean;
  initialPhone?: string | null;
  initialDraft?: string | null;
}

export function SmsPanel({ compact = false, initialPhone = null, initialDraft = null }: SmsPanelProps = {}) {
  const isMobile = useIsMobile();
  const { role, employeeId } = useEffectiveAuth();
  const { conversations, loading, sending, sendSms, markAsRead, hasMore, loadMore, loadingMore } = useSmsLogScoped();
  // Resolve incoming phone (any format) to a conversation key by matching last-10 digits
  const resolveConversationKey = (raw: string | null): string | null => {
    if (!raw) return null;
    const last10 = normalizeLast10(raw);
    if (!last10) return raw;
    const match = conversations.find((c) => normalizeLast10(c.phoneNumber) === last10);
    return match ? match.phoneNumber : (toE164(raw) ?? raw);
  };
  const [selectedPhone, setSelectedPhone] = useState<string | null>(resolveConversationKey(initialPhone));
  const [newMessageMode, setNewMessageMode] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"customers" | "team" | "external">("customers");

  const { startSmsSession } = useCopilotPanel();

  useEffect(() => {
    if (initialPhone) {
      setSelectedPhone(resolveConversationKey(initialPhone));
      setNewMessageMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone, conversations.length]);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.phoneNumber.includes(q) || (c.contactName && c.contactName.toLowerCase().includes(q));
  });

  const team = filtered.filter((c) => c.contactType === "employee");
  // Marketing/ad-agency contacts are grouped under Vendors (they're external B2B)
  const external = filtered.filter((c) => c.contactType === "vendor" || c.contactType === "marketing");
  // Customers tab = anything that isn't team or vendor/marketing
  const customers = filtered.filter((c) => !["employee", "vendor", "marketing"].includes(c.contactType));

  const sumUnread = (list: typeof conversations) => list.reduce((s, c) => s + (c.unreadCount || 0), 0);
  const teamUnread = sumUnread(team);
  const externalUnread = sumUnread(external);
  const customersUnread = sumUnread(customers);

  const selectConversation = (phone: string) => {
    setSelectedPhone(phone);
    setNewMessageMode(false);
    const convo = conversations.find((c) => c.phoneNumber === phone);
    // Auto-switch tab so the selected convo lives under the visible tab
    if (convo) {
      if (convo.contactType === "employee") setActiveTab("team");
      else if (convo.contactType === "vendor" || convo.contactType === "marketing") setActiveTab("external");
      else setActiveTab("customers");
    }
    startSmsSession(phone, convo?.contactName || undefined);
  };

  const handleNewMessage = () => {
    setSelectedPhone(null);
    setNewMessageMode(true);
  };

  const handleSend = async (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => {
    const convo = conversations.find((c) => c.phoneNumber === to);
    const name = contactName || convo?.contactName || undefined;
    const success = await sendSms(to, body, jobId, name, mediaUrls);
    if (success && newMessageMode) {
      setNewMessageMode(false);
      setSelectedPhone(to);
    }
    return success;
  };

  const selectedConvo = selectedPhone ? conversations.find((c) => c.phoneNumber === selectedPhone) || null : null;

  // --- MOBILE: expandable card layout ---
  if (isMobile) {
    // If navigated from calls/voicemail or tapped a convo, show full thread
    if (selectedPhone) {
      return (
        <SmsThreadView
          conversation={selectedConvo}
          sending={sending}
          onSend={handleSend}
          onMarkRead={markAsRead}
          onBack={() => setSelectedPhone(null)}
          newMessageMode={!selectedConvo}
          prefillPhone={!selectedConvo ? selectedPhone : undefined}
          prefillBody={initialDraft}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
      );
    }

    if (newMessageMode) {
      return (
        <SmsThreadView
          conversation={null}
          sending={sending}
          onSend={handleSend}
          onMarkRead={markAsRead}
          onBack={() => setNewMessageMode(false)}
          newMessageMode={true}
          prefillBody={initialDraft}
        />
      );
    }

    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages..." className="pl-9 h-9" />
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={handleNewMessage}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <SmsTabbedList
            activeTab={activeTab}
            onTabChange={setActiveTab}
            customers={customers}
            team={team}
            external={external}
            customersUnread={customersUnread}
            teamUnread={teamUnread}
            externalUnread={externalUnread}
            selectedPhone={selectedPhone}
            onSelect={selectConversation}
            empty={filtered.length === 0}
            density="comfortable"
          />
        </div>
      </ScrollArea>
    );
  }

  // --- DESKTOP: 2-column split layout ---
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Left column — conversation list */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="flex flex-col h-full">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages..." className="pl-9 h-9" />
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={handleNewMessage}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <SmsTabbedList
          activeTab={activeTab}
          onTabChange={setActiveTab}
          customers={customers}
          team={team}
          external={external}
          customersUnread={customersUnread}
          teamUnread={teamUnread}
          externalUnread={externalUnread}
          selectedPhone={selectedPhone}
          onSelect={selectConversation}
          empty={filtered.length === 0}
          density="compact"
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right column — thread view */}
      <ResizablePanel defaultSize={75} className="flex flex-col min-w-0 h-full">
        {newMessageMode ? (
          <SmsThreadView
            conversation={null}
            sending={sending}
            onSend={handleSend}
            onMarkRead={markAsRead}
            onBack={() => setNewMessageMode(false)}
            newMessageMode={true}
            prefillBody={initialDraft}
          />
        ) : selectedConvo ? (
          <SmsThreadView
            conversation={selectedConvo}
            sending={sending}
            onSend={handleSend}
            onMarkRead={markAsRead}
            prefillBody={initialDraft}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        ) : selectedPhone ? (
          <SmsThreadView
            conversation={null}
            sending={sending}
            onSend={handleSend}
            onMarkRead={markAsRead}
            onBack={() => setSelectedPhone(null)}
            newMessageMode={true}
            prefillPhone={selectedPhone}
            prefillBody={initialDraft}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageSquare className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tabbed list — Customers / Team / Vendors with red unread badges
// ──────────────────────────────────────────────────────────────────────────────
type SmsConvo = ReturnType<typeof useSmsLogScoped>["conversations"][number];

interface SmsTabbedListProps {
  activeTab: "customers" | "team" | "external";
  onTabChange: (t: "customers" | "team" | "external") => void;
  customers: SmsConvo[];
  team: SmsConvo[];
  external: SmsConvo[];
  customersUnread: number;
  teamUnread: number;
  externalUnread: number;
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  empty: boolean;
  density: "comfortable" | "compact";
}

function SmsTabbedList({
  activeTab,
  onTabChange,
  customers,
  team,
  external,
  customersUnread,
  teamUnread,
  externalUnread,
  selectedPhone,
  onSelect,
  empty,
  density,
}: SmsTabbedListProps) {
  const list =
    activeTab === "customers" ? customers : activeTab === "team" ? team : external;
  const itemSpacing = density === "compact" ? "space-y-0.5" : "space-y-1";
  const padding = density === "compact" ? "p-2" : "px-1";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as "customers" | "team" | "external")}
      className="flex-1 flex flex-col min-h-0"
    >
      <TabsList className="grid grid-cols-3 mx-2 mt-1 h-8">
        <TabBadgeTrigger
          value="customers"
          icon={<User className="h-3 w-3" />}
          label="Customers"
          count={customers.length}
          unread={customersUnread}
        />
        <TabBadgeTrigger
          value="team"
          icon={<Wrench className="h-3 w-3" />}
          label="Team"
          count={team.length}
          unread={teamUnread}
        />
        <TabBadgeTrigger
          value="external"
          icon={<Building2 className="h-3 w-3" />}
          label="External"
          count={external.length}
          unread={externalUnread}
        />
      </TabsList>

      <TabsContent value={activeTab} className="flex-1 min-h-0 mt-2">
        <ScrollArea className="h-full">
          <div className={cn(padding, itemSpacing)}>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {empty ? "No conversations" : `No ${activeTab} conversations`}
              </p>
            ) : (
              list.map((c) => (
                <SmsConversationListItem
                  key={c.phoneNumber}
                  conversation={c}
                  isSelected={selectedPhone === c.phoneNumber}
                  onSelect={() => onSelect(c.phoneNumber)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function TabBadgeTrigger({
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
