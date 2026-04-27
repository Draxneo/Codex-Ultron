import { useCustomerInvoices } from "@/hooks/useCustomerHistory";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export function InvoicesTab({ customerId }: { customerId: string }) {
  const { data: invoices = [], isLoading } = useCustomerInvoices(customerId);
  const navigate = useNavigate();

  const statusColor = (s: string) => {
    if (s === "paid") return "default";
    if (s === "overdue") return "destructive";
    return "secondary";
  };

  return (
    <Card className="shadow-none border">
      <div className="p-4 border-b">
        <h2 className="text-sm font-bold">{invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}</h2>
      </div>
      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="p-8 text-sm text-muted-foreground text-center">No invoices yet</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((i: any) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => navigate(`/records/invoice/${i.id}`)}>
                <TableCell className="font-medium">#{i.invoice_number || i.id.slice(0, 8)}</TableCell>
                <TableCell><Badge variant={statusColor(i.status) as any} className="text-[10px] capitalize">{i.status}</Badge></TableCell>
                <TableCell>{format(new Date(i.created_at), "MMM d, yyyy")}</TableCell>
                <TableCell>{i.paid_at ? format(new Date(i.paid_at), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="text-right font-mono">${Number(i.total).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
