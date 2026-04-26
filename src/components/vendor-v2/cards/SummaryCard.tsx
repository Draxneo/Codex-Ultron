import { Card } from "@/components/ui/card";

interface Props {
  totalOrders: number;
  lastOrderDate: string | null;
  contactCount: number;
  branchCount: number;
}

export function SummaryCard({ totalOrders, lastOrderDate, contactCount, branchCount }: Props) {
  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Summary</h3>
      <dl className="space-y-2 text-sm">
        <Row label="Total orders" value={totalOrders.toString()} />
        <Row label="Last order" value={lastOrderDate ? new Date(lastOrderDate).toLocaleDateString() : "—"} />
        <Row label="Contacts" value={contactCount.toString()} />
        <Row label="Branches" value={branchCount.toString()} />
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
