import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getExpectedJobSummary, type ExpectedItemStatus, type ExpectedJobItem } from "@/lib/expectedJobItems";
import { cn } from "@/lib/utils";

const STATUS_META: Record<ExpectedItemStatus, { icon: React.ElementType; className: string }> = {
  done: { icon: CheckCircle2, className: "text-emerald-600 bg-emerald-600/10" },
  needs_attention: { icon: AlertTriangle, className: "text-amber-600 bg-amber-500/10" },
  waiting: { icon: Clock3, className: "text-blue-600 bg-blue-500/10" },
  upcoming: { icon: CircleDashed, className: "text-muted-foreground bg-muted" },
  skipped: { icon: SkipForward, className: "text-muted-foreground bg-muted" },
};

export type ExpectedItemQuickAction = {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  run: () => void | Promise<void>;
  secondaryLabel?: string;
  secondaryBusy?: boolean;
  secondaryRun?: () => void | Promise<void>;
};

interface ExpectedItemsCardProps {
  items: ExpectedJobItem[];
  subtitle?: string;
  quickActions?: (item: ExpectedJobItem) => ExpectedItemQuickAction | null;
}

export function ExpectedItemsCard({
  items,
  subtitle = "Auto-closes as real actions happen.",
  quickActions,
}: ExpectedItemsCardProps) {
  const summary = getExpectedJobSummary(items);
  const openItems = items.filter((item) => item.status !== "done" && item.status !== "skipped");

  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">What&apos;s Next</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">{summary.done}/{summary.total}</div>
            <div className="text-[11px] text-muted-foreground">{summary.percent}% complete</div>
          </div>
        </div>
        <Progress value={summary.percent} className="mt-3 h-1.5" />
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          const quickAction = item.status === "done" || item.status === "skipped" ? null : quickActions?.(item);

          return (
            <div key={item.key} className="flex items-start gap-3 px-4 py-2.5">
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", meta.className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("truncate text-sm font-medium", item.status === "done" && "text-muted-foreground line-through")}>
                    {item.label}
                  </p>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.owner}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
              </div>
              {quickAction && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={quickAction.disabled || quickAction.busy}
                    onClick={quickAction.run}
                  >
                    {quickAction.busy ? "Saving..." : quickAction.label}
                  </Button>
                  {quickAction.secondaryRun && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={quickAction.secondaryBusy}
                      onClick={quickAction.secondaryRun}
                    >
                      {quickAction.secondaryLabel}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openItems.length === 0 && (
        <div className="bg-emerald-600/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
          All expected items are closed.
        </div>
      )}
    </Card>
  );
}
