import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const HCP_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  "scheduled": { label: "HCP: Scheduled", className: "border-sky/30 text-[hsl(var(--sky))] bg-[hsl(var(--sky))]/10" },
  "in progress": { label: "HCP: In Progress", className: "border-amber-500/30 text-amber-600 bg-amber-500/10" },
  "needs scheduling": { label: "HCP: Needs Sched.", className: "border-warm/30 text-warm bg-warm/10" },
  "complete": { label: "HCP: Complete", className: "border-complete/30 text-[hsl(var(--complete))] bg-[hsl(var(--complete))]/10" },
  "completed": { label: "HCP: Complete", className: "border-complete/30 text-[hsl(var(--complete))] bg-[hsl(var(--complete))]/10" },
  "pro canceled": { label: "HCP: Canceled", className: "border-destructive/30 text-destructive bg-destructive/10" },
  "unscheduled": { label: "HCP: Unscheduled", className: "border-muted-foreground/30 text-muted-foreground bg-muted/50" },
  "dispatched": { label: "HCP: Dispatched", className: "border-sky/30 text-[hsl(var(--sky))] bg-[hsl(var(--sky))]/10" },
};

function getHcpStyle(status: string) {
  const lower = status.toLowerCase();
  for (const [key, val] of Object.entries(HCP_STATUS_STYLES)) {
    if (lower.includes(key)) return val;
  }
  return { label: `HCP: ${status}`, className: "border-muted-foreground/30 text-muted-foreground bg-muted/50" };
}

export function HcpStatusBadge({ status, className }: { status: string | null; className?: string }) {
  if (!status) return null;
  const style = getHcpStyle(status);
  return (
    <Badge variant="outline" className={cn("text-[9px] font-semibold", style.className, className)}>
      {style.label}
    </Badge>
  );
}
