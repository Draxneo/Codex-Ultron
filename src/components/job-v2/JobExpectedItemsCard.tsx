import { CheckCircle2, CircleDashed, Clock3, SkipForward, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { usePartsOrders } from "@/hooks/usePartsOrders";
import { getExpectedJobItems, getExpectedJobSummary, type ExpectedItemStatus } from "@/lib/expectedJobItems";
import { cn } from "@/lib/utils";

const STATUS_META: Record<ExpectedItemStatus, { icon: React.ElementType; className: string; label: string }> = {
  done: { icon: CheckCircle2, className: "text-emerald-600 bg-emerald-600/10", label: "Done" },
  needs_attention: { icon: AlertTriangle, className: "text-amber-600 bg-amber-500/10", label: "Needs attention" },
  waiting: { icon: Clock3, className: "text-blue-600 bg-blue-500/10", label: "Waiting" },
  upcoming: { icon: CircleDashed, className: "text-muted-foreground bg-muted", label: "Upcoming" },
  skipped: { icon: SkipForward, className: "text-muted-foreground bg-muted", label: "Skipped" },
};

export function JobExpectedItemsCard({ job, jobId }: { job: any; jobId: string }) {
  const { data: invoices = [] } = useCustomerInvoices(jobId);
  const { data: partsOrders = [] } = usePartsOrders(jobId);
  const items = getExpectedJobItems(job, invoices as any[], partsOrders as any[]);
  const summary = getExpectedJobSummary(items);
  const openItems = items.filter((item) => item.status !== "done" && item.status !== "skipped");

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">What&apos;s Next</h3>
            <p className="text-xs text-muted-foreground">
              Auto-closes as real job actions happen.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">{summary.done}/{summary.total}</div>
            <div className="text-[11px] text-muted-foreground">{summary.percent}% complete</div>
          </div>
        </div>
        <Progress value={summary.percent} className="h-1.5 mt-3" />
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          return (
            <div key={item.key} className="px-4 py-2.5 flex items-start gap-3">
              <span className={cn("mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0", meta.className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm font-medium truncate", item.status === "done" && "text-muted-foreground line-through")}>
                    {item.label}
                  </p>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.owner}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
              </div>
            </div>
          );
        })}
      </div>

      {openItems.length === 0 && (
        <div className="px-4 py-3 bg-emerald-600/5 text-xs text-emerald-700 dark:text-emerald-400">
          All expected items are closed for this job.
        </div>
      )}
    </Card>
  );
}
