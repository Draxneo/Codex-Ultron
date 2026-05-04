import { useState } from "react";
import { useRecentActivity, type RecentActivityItem } from "@/hooks/useRecentActivity";
import { Phone, MessageSquare, Briefcase, History, MapPin, Loader2, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  label: string;
  created_at: string;
  ended_at?: string | null;
  phone_number?: string | null;
}

interface Props {
  onSelectContext: (item: RecentActivityItem) => void;
  onSelectSession: (sessionId: string) => void;
  sessions: Session[];
  activeSessionId?: string | null;
}

type Tab = "jobs" | "sms" | "calls" | "sessions";

const TABS: { key: Tab; label: string; Icon: typeof Phone; tint: string }[] = [
  { key: "jobs", label: "Jobs", Icon: Briefcase, tint: "text-amber-500" },
  { key: "sms", label: "SMS", Icon: MessageSquare, tint: "text-green-500" },
  { key: "calls", label: "Calls", Icon: Phone, tint: "text-blue-500" },
  { key: "sessions", label: "History", Icon: History, tint: "text-muted-foreground" },
];

export function ContextPicker({ onSelectContext, onSelectSession, sessions, activeSessionId }: Props) {
  const [tab, setTab] = useState<Tab>("jobs");
  const { data, isLoading } = useRecentActivity(8);
  const buckets = data ?? { jobs: [], sms: [], calls: [] };

  const counts: Record<Tab, number> = {
    jobs: buckets.jobs.length,
    sms: buckets.sms.length,
    calls: buckets.calls.length,
    sessions: sessions.length,
  };

  return (
    <div className="w-full">
      {/* Flat tabs */}
      <div className="grid grid-cols-4 border-b border-border/50">
        {TABS.map(({ key, label, Icon, tint }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors relative",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", active ? tint : "")} />
              <span className="flex items-center gap-1">
                {label}
                {counts[key] > 0 && (
                  <span className="text-[9px] text-muted-foreground font-normal">{counts[key]}</span>
                )}
              </span>
              {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="max-h-[360px] overflow-y-auto">
        {isLoading && tab !== "sessions" ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...
          </div>
        ) : tab === "sessions" ? (
          sessions.length === 0 ? (
            <EmptyState text="No previous chats yet" />
          ) : (
            sessions.slice(0, 12).map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left",
                  s.id === activeSessionId && "bg-accent"
                )}
              >
                {s.phone_number ? (
                  <Phone className="h-3 w-3 text-primary shrink-0" />
                ) : (
                  <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{s.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </p>
                </div>
                {s.ended_at && (
                  <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded shrink-0">archived</span>
                )}
              </button>
            ))
          )
        ) : (
          <ContextList items={buckets[tab]} onSelect={onSelectContext} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-6 text-xs text-muted-foreground text-center">{text}</div>;
}

function ContextList({ items, onSelect }: { items: RecentActivityItem[]; onSelect: (i: RecentActivityItem) => void }) {
  if (items.length === 0) return <EmptyState text="Nothing recent" />;
  return (
    <div>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          className="w-full flex flex-col items-start gap-0.5 px-3 py-2 hover:bg-accent text-left border-b border-border/30 last:border-0"
        >
          <div className="flex items-center gap-1.5 w-full">
            <span className="text-xs font-medium truncate flex-1">{item.contact_name}</span>
            {item.subtype === "missed_call" && (
              <span className="text-[9px] uppercase font-semibold text-destructive bg-destructive/10 px-1 rounded">
                missed
              </span>
            )}
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: false })}
            </span>
          </div>
          {item.address && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate w-full">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{item.address}</span>
            </div>
          )}
          {item.phone && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate w-full">
              <Phone className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{item.phone}</span>
            </div>
          )}
          {item.preview && (
            <p className="text-[10px] text-muted-foreground truncate w-full">{item.preview}</p>
          )}
        </button>
      ))}
    </div>
  );
}
