import { Card } from "@/components/ui/card";

interface Props {
  lifetimeValue: number;
  outstandingBalance: number;
  jobCount: number;
  lastJobDate: string | null;
}

export function SummaryCard({ lifetimeValue, outstandingBalance, jobCount, lastJobDate }: Props) {
  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Summary</h3>
      <dl className="space-y-2 text-sm">
        <Row label="Lifetime value" value={`$${lifetimeValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <Row label="Outstanding balance" value={`$${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} highlight={outstandingBalance > 0} />
        <Row label="Total jobs" value={jobCount.toString()} />
        <Row label="Last job" value={lastJobDate ? new Date(lastJobDate).toLocaleDateString() : "—"} />
      </dl>
    </Card>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={highlight ? "font-semibold text-destructive" : "font-medium"}>{value}</dd>
    </div>
  );
}
