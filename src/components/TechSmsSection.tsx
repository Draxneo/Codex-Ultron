/**
 * TechSmsSection — Renders the "Tech Texts" section in Team HQ's left aside.
 *
 * Lists active employees with phone numbers, sorted by most recent message.
 * Shows unread count badge and last message preview. Click to select a tech
 * and switch the center pane to SMS view.
 */
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTechSmsThreads, type TechSmsThread } from "@/hooks/useTechSmsThreads";

interface TechSmsSectionProps {
  selectedTechSmsId: string | null;
  onSelectTech: (employeeId: string, phone: string, name: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

function truncatePreview(text: string, maxLen: number = 35): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function timeAgo(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
  } catch {
    return "unknown";
  }
}

export function TechSmsSection({ selectedTechSmsId, onSelectTech }: TechSmsSectionProps) {
  const { threads, totalUnread, isLoading } = useTechSmsThreads();

  return (
    <section>
      {/* Section header with icon and total unread badge */}
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tech Texts</p>
        {totalUnread > 0 && (
          <Badge variant="default" className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px]">
            {totalUnread > 99 ? "99+" : totalUnread}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        {/* Loading skeleton rows */}
        {isLoading &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`tech-sms-loading-${index}`} className="h-10 rounded-md" />
          ))}

        {/* Tech SMS thread rows */}
        {!isLoading &&
          threads.map((thread) => (
            <TechSmsThreadRow
              key={thread.employeeId}
              thread={thread}
              isSelected={selectedTechSmsId === thread.employeeId}
              onSelect={() => onSelectTech(thread.employeeId, thread.phone, thread.name)}
            />
          ))}

        {/* Empty state */}
        {!isLoading && threads.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No active technicians with phone numbers.
          </p>
        )}
      </div>
    </section>
  );
}

interface TechSmsThreadRowProps {
  thread: TechSmsThread;
  isSelected: boolean;
  onSelect: () => void;
}

function TechSmsThreadRow({ thread, isSelected, onSelect }: TechSmsThreadRowProps) {
  return (
    <button
      onClick={onSelect}
      aria-label={`Open SMS thread with ${thread.name}`}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
      )}
    >
      {/* Avatar with initials */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs font-semibold">{initials(thread.name)}</AvatarFallback>
      </Avatar>

      {/* Name, preview, time, and unread badge */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium text-sm">{thread.name}</span>
          {thread.unreadCount > 0 && (
            <Badge variant="default" className="h-5 min-w-5 justify-center px-1 text-[10px] shrink-0">
              {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{truncatePreview(thread.lastMessage)}</p>
        <p className="text-xs text-muted-foreground/70">{timeAgo(thread.lastMessageAt)}</p>
      </div>
    </button>
  );
}
