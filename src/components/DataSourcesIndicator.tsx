import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DataSourceStatus } from "@/hooks/useJobEquipment";

interface Props {
  sources: DataSourceStatus;
  hasConflicts: boolean;
  totalsDifference: number | null;
  invoiceTotal: number;
  ticketTotal: number;
}

function SourceBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <Badge
      variant={active ? "default" : "outline"}
      className={cn(
        "text-[10px] gap-1",
        active ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground"
      )}
    >
      {active ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      {label}
    </Badge>
  );
}

export function DataSourcesIndicator({ sources, hasConflicts, totalsDifference, invoiceTotal, ticketTotal }: Props) {
  const totalsMatch = totalsDifference !== null && totalsDifference <= 5;
  const totalsMismatch = totalsDifference !== null && totalsDifference > 5;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-primary" /> Data Sources
      </h3>
      <div className="flex flex-wrap gap-1.5">
        <SourceBadge label="Import" active={sources.hcp} />
        <SourceBadge label="Invoice" active={sources.invoice} />
        <SourceBadge label="Data Plate" active={sources.data_plate} />
        <SourceBadge label="Tech Form" active={sources.tech_form} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {hasConflicts ? (
          <span className="flex items-center gap-1 text-destructive font-medium">
            <AlertTriangle className="h-3 w-3" /> Serial/model conflict detected
          </span>
        ) : (
          Object.values(sources).filter(Boolean).length > 1 && (
            <span className="flex items-center gap-1 text-[hsl(var(--complete))] font-medium">
              <CheckCircle className="h-3 w-3" /> Serials match
            </span>
          )
        )}
        {totalsMatch && (
          <span className="flex items-center gap-1 text-[hsl(var(--complete))] font-medium">
            <CheckCircle className="h-3 w-3" /> Totals verified
          </span>
        )}
        {totalsMismatch && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <AlertTriangle className="h-3 w-3" /> Totals differ by ${totalsDifference!.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
