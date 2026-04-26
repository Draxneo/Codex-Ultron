import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function LeadsTab({ customerId }: { customerId: string }) {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["customer-leads", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads" as any)
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  return (
    <Card className="shadow-none border">
      <div className="p-4 border-b">
        <h2 className="text-sm font-bold">{leads.length} {leads.length === 1 ? "lead" : "leads"}</h2>
      </div>
      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="p-8 text-sm text-muted-foreground text-center">No leads yet</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell>{l.source || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{l.status || "new"}</Badge></TableCell>
                <TableCell>{l.assigned_to || "—"}</TableCell>
                <TableCell>{format(new Date(l.created_at), "MMM d, yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
