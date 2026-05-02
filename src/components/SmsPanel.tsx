import { useEffect, useState } from "react";
import { MessageSquare, Plus, Search } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { SmsThreadView } from "@/components/SmsThreadView";
import { SmsConversationListItem } from "@/components/SmsConversationListItem";
import { cn } from "@/lib/utils";
import { normalizeLast10, toE164 } from "@/lib/formatters";
import { getSmsThreadKey } from "@/hooks/useSmsLog";

interface SmsPanelProps {
  compact?: boolean;
  initialPhone?: string | null;
  initialDraft?: string | null;
}

type SmsFilter = "all" | "needs_reply" | "waiting" | "done" | "unknown" | "unread";
type SmsConvo = ReturnType<typeof useSmsLogScoped>["conversations"][number];

const SMS_FILTERS: { key: SmsFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs Reply" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
  { key: "unknown", label: "Unknown" },
  { key: "unread", label: "Unread" },
];

export function SmsPanel({ initialPhone = null, initialDraft = null }: SmsPanelProps = {}) {
  const isMobile = useIsMobile();
  const { conversations, sending, sendSms, markAsRead, setThreadStatus, hasMore, loadMore, loadingMore } = useSmsLogScoped();
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [newMessageMode, setNewMessageMode] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<SmsFilter>("all");
  const { startSmsSession } = useCopilotPanel();

  const resolveConversationKey = (raw: string | null): string | null => {
    if (!raw) return null;
    const last10 = normalizeLast10(raw);
    if (!last10) return raw;
    const match = conversations.find((c) => normalizeLast10(c.phoneNumber) === last10);
    return match ? match.threadKey : getSmsThreadKey(toE164(raw) ?? raw);
  };

  useEffect(() => {
    if (!initialPhone) return;
    setSelectedThreadKey(resolveConversationKey(initialPhone));
    setNewMessageMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone, conversations.length]);

  const searched = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.phoneNumber.includes(q) ||
      (c.contactName && c.contactName.toLowerCase().includes(q)) ||
      (c.jobContext?.label && c.jobContext.label.toLowerCase().includes(q))
    );
  });

  const filtered = searched.filter((c) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unknown") return c.contactType === "unknown";
    if (activeFilter === "unread") return c.unreadCount > 0;
    return c.status === activeFilter;
  });

  const filterCounts: Record<SmsFilter, number> = {
    all: searched.length,
    needs_reply: searched.filter((c) => c.status === "needs_reply").length,
    waiting: searched.filter((c) => c.status === "waiting").length,
    done: searched.filter((c) => c.status === "done").length,
    unknown: searched.filter((c) => c.contactType === "unknown").length,
    unread: searched.filter((c) => c.unreadCount > 0).length,
  };

  const selectConversation = (threadKey: string) => {
    const convo = conversations.find((c) => c.threadKey === threadKey);
    setSelectedThreadKey(threadKey);
    setNewMessageMode(false);
    startSmsSession(convo?.phoneNumber || threadKey, convo?.contactName || undefined);
  };

  const handleNewMessage = () => {
    setSelectedThreadKey(null);
    setNewMessageMode(true);
  };

  const handleSend = async (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => {
    const convo = selectedThreadKey
      ? conversations.find((c) => c.threadKey === selectedThreadKey)
      : conversations.find((c) => c.phoneNumber === to);
    const name = contactName || convo?.contactName || undefined;
    const success = await sendSms(to, body, jobId, name, mediaUrls, {
      fromNumber: convo?.toNumber || null,
      businessUnitId: convo?.businessUnitId || null,
      threadKey: convo?.threadKey || null,
    });
    if (success && newMessageMode) {
      setNewMessageMode(false);
      setSelectedThreadKey(convo?.threadKey || getSmsThreadKey(to, convo?.toNumber, convo?.businessUnitId));
    }
    return success;
  };

  const selectedConvo = selectedThreadKey ? conversations.find((c) => c.threadKey === selectedThreadKey) || null : null;
  const selectedPhone = selectedConvo?.phoneNumber || (selectedThreadKey ? selectedThreadKey.split("|")[0] : null);
  const selectedReadTarget = selectedConvo?.threadKey || selectedThreadKey || "";
  const markSelectedRead = () => {
    if (selectedReadTarget) markAsRead(selectedReadTarget);
  };
  const setSelectedStatus = (_phone: string, status: Parameters<typeof setThreadStatus>[1]) => {
    if (selectedReadTarget) setThreadStatus(selectedReadTarget, status);
  };

  if (isMobile) {
    if (selectedPhone) {
      return (
        <SmsThreadView
          conversation={selectedConvo}
          sending={sending}
          onSend={handleSend}
          onMarkRead={markSelectedRead}
          onStatusChange={setSelectedStatus}
          onBack={() => setSelectedThreadKey(null)}
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
          onStatusChange={setThreadStatus}
          onBack={() => setNewMessageMode(false)}
          newMessageMode={true}
          prefillBody={initialDraft}
        />
      );
    }

    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-3">
          <SmsSearchBar search={search} setSearch={setSearch} onNewMessage={handleNewMessage} />
          <SmsFilteredList
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            conversations={filtered}
            counts={filterCounts}
            selectedThreadKey={selectedThreadKey}
            onSelect={selectConversation}
            empty={searched.length === 0}
            density="comfortable"
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="flex flex-col h-full">
        <div className="p-3 border-b">
          <SmsSearchBar search={search} setSearch={setSearch} onNewMessage={handleNewMessage} />
        </div>
        <SmsFilteredList
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          conversations={filtered}
          counts={filterCounts}
          selectedThreadKey={selectedThreadKey}
          onSelect={selectConversation}
          empty={searched.length === 0}
          density="compact"
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={75} className="flex flex-col min-w-0 h-full">
        {newMessageMode ? (
          <SmsThreadView
            conversation={null}
            sending={sending}
            onSend={handleSend}
            onMarkRead={markAsRead}
            onStatusChange={setThreadStatus}
            onBack={() => setNewMessageMode(false)}
            newMessageMode={true}
            prefillBody={initialDraft}
          />
        ) : selectedConvo ? (
          <SmsThreadView
            conversation={selectedConvo}
            sending={sending}
            onSend={handleSend}
            onMarkRead={markSelectedRead}
            onStatusChange={setSelectedStatus}
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
            onStatusChange={setThreadStatus}
            onBack={() => setSelectedThreadKey(null)}
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

function SmsSearchBar({
  search,
  setSearch,
  onNewMessage,
}: {
  search: string;
  setSearch: (value: string) => void;
  onNewMessage: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages..." className="pl-9 h-9" />
      </div>
      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={onNewMessage}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface SmsFilteredListProps {
  activeFilter: SmsFilter;
  onFilterChange: (t: SmsFilter) => void;
  conversations: SmsConvo[];
  counts: Record<SmsFilter, number>;
  selectedThreadKey: string | null;
  onSelect: (threadKey: string) => void;
  empty: boolean;
  density: "comfortable" | "compact";
}

function SmsFilteredList({
  activeFilter,
  onFilterChange,
  conversations,
  counts,
  selectedThreadKey,
  onSelect,
  empty,
  density,
}: SmsFilteredListProps) {
  const itemSpacing = density === "compact" ? "space-y-0.5" : "space-y-1";
  const padding = density === "compact" ? "p-2" : "px-1";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-2 pt-2 pb-1 flex gap-1 overflow-x-auto border-b">
        {SMS_FILTERS.map((filter) => (
          <Button
            key={filter.key}
            type="button"
            size="sm"
            variant={activeFilter === filter.key ? "default" : "ghost"}
            className="h-7 shrink-0 px-2 text-[11px]"
            onClick={() => onFilterChange(filter.key)}
          >
            {filter.label}
            <span className="ml-1 opacity-70">{counts[filter.key]}</span>
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className={cn(padding, itemSpacing)}>
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {empty ? "No conversations" : "No conversations in this filter"}
            </p>
          ) : (
            conversations.map((c) => (
              <SmsConversationListItem
                key={c.threadKey}
                conversation={c}
                isSelected={selectedThreadKey === c.threadKey}
                onSelect={() => onSelect(c.threadKey)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
