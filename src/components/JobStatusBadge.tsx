import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatusConfig } from "@/lib/statusColors";

type EntityType = "job" | "estimate" | "invoice";

export function JobStatusBadge({ status, className, entityType = "job" }: { status: string; className?: string; entityType?: EntityType }) {
  const config = getStatusConfig(status, entityType);
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold gap-1", config.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </Badge>
  );
}

export const JOB_STATUSES = ["new", "scheduled", "in_progress", "done", "invoiced", "on_hold", "canceled"] as const;
export type JobStatus = typeof JOB_STATUSES[number];
