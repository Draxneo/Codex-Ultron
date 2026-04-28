import { useRecentActivity, useActivityLog } from "@/hooks/useActivityLog";
import { formatDistanceToNow } from "date-fns";
import { Activity, CheckCircle2, RotateCcw, StickyNote, XCircle, Phone } from "lucide-react";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--complete))]" />,
  reopened: <RotateCcw className="h-3.5 w-3.5 text-primary" />,
  skipped: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  note_added: <StickyNote className="h-3.5 w-3.5 text-primary" />,
  marked_na: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  call_summary: <Phone className="h-3.5 w-3.5 text-primary" />,
};

type ActivityEntry = {
  id: string;
  action: string;
  created_at: string | null;
  performed_by?: string | null;
  details?: string | null;
};

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const icon = ACTION_ICONS[entry.action] || <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
  const time = entry.created_at
    ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })
    : "";

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs">
          <span className="font-medium">{entry.performed_by || "Someone"}</span>{" "}
          <span className="text-muted-foreground">{entry.action.replace("_", " ")}</span>
        </p>
        {entry.details && (
          <p className="text-xs text-muted-foreground truncate">{entry.details}</p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
    </div>
  );
}

export function RecentActivityFeed() {
  const { data: entries, isLoading } = useRecentActivity(15);

  if (isLoading) return null;
  if (!entries || entries.length === 0) return null;

  return (
    <section className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Recent Activity</span>
      </div>
      <div className="bg-card rounded-lg border p-2">
        {entries.map((e) => (
          <ActivityItem key={e.id} entry={e} />
        ))}
      </div>
    </section>
  );
}

export function JobActivityFeed({ jobId }: { jobId: string }) {
  const { data: entries, isLoading } = useActivityLog(jobId);

  if (isLoading) return null;
  if (!entries || entries.length === 0) return null;

  return (
    <section className="px-4 py-3">
      <details>
        <summary className="text-xs font-semibold text-muted-foreground cursor-pointer flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" /> Activity Log ({entries.length})
        </summary>
        <div className="mt-2 bg-card rounded-lg border p-2">
          {entries.map((e) => (
            <ActivityItem key={e.id} entry={e} />
          ))}
        </div>
      </details>
    </section>
  );
}
