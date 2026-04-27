import { useCustomerEstimates } from "@/hooks/useCustomerHistory";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export function EstimatesTab({ customerId }: { customerId: string }) {
  const { data: estimates = [], isLoading } = useCustomerEstimates(customerId);
  const navigate = useNavigate();

  return (
    <Card className="shadow-none border">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-sm font-bold">{estimates.length} {estimates.length === 1 ? "estimate" : "estimates"}</h2>
        <Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" />New estimate</Button>
      </div>
      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : estimates.length === 0 ? (
        <p className="p-8 text-sm text-muted-foreground text-center">No estimates yet</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estimate #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimates.map((e: any) => (
              <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(`/records/estimate/${e.id}`)}>
                <TableCell className="font-medium">#{e.estimate_number}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{e.work_status || "draft"}</Badge></TableCell>
                <TableCell>{e.scheduled_date ? format(new Date(e.scheduled_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell>{e.assigned_to || "—"}</TableCell>
                <TableCell className="max-w-md truncate">{e.description || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
