import { useRecentActivity, type RecentActivityItem } from "@/hooks/useRecentActivity";
import { Phone, MessageSquare, Briefcase, Loader2, ChevronDown, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  onSelect: (item: RecentActivityItem) => void;
}

type BucketKey = "jobs" | "sms" | "calls";

const BUCKET_META: Record<BucketKey, { label: string; Icon: typeof Phone; tint: string }> = {
  jobs: { label: "Jobs", Icon: Briefcase, tint: "text-amber-500" },
  sms: { label: "SMS", Icon: MessageSquare, tint: "text-green-500" },
  calls: { label: "Calls", Icon: Phone, tint: "text-blue-500" },
};

export function RecentActivityStrip({ onSelect }: Props) {
  const { data, isLoading } = useRecentActivity(8);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading recent activity...
      </div>
    );
  }
  const buckets = data ?? { jobs: [], sms: [], calls: [] };
  const total = buckets.jobs.length + buckets.sms.length + buckets.calls.length;
  if (total === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
        Pick a recent touchpoint to give JARVIS context
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(BUCKET_META) as BucketKey[]).map((key) => {
          const meta = BUCKET_META[key];
          const items = buckets[key];
          const Icon = meta.Icon;
          return (
            <DropdownMenu key={key}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg",
                    "border border-border/50 bg-card/40 hover:bg-accent hover:border-primary/30",
                    "transition-colors text-xs font-medium"
                  )}
                  disabled={items.length === 0}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.tint)} />
                    <span className="truncate">{meta.label}</span>
                    {items.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {items.length}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[300px] max-h-[360px] overflow-y-auto">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Recent {meta.label}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {items.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    Nothing recent
                  </div>
                ) : (
                  items.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        <span className="text-xs font-medium truncate flex-1">
                          {item.contact_name}
                        </span>
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
                        <p className="text-[10px] text-muted-foreground truncate w-full">
                          {item.preview}
                        </p>
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </div>
  );
}
