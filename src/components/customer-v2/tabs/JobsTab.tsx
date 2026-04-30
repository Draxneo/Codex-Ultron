import { useCustomerJobs } from "@/hooks/useCustomerHistory";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export function JobsTab({ customerId }: { customerId: string }) {
  const { data: jobs = [], isLoading } = useCustomerJobs(customerId);
  const navigate = useNavigate();

  return (
    <Card className="shadow-none border">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-sm font-bold">{jobs.length} {jobs.length === 1 ? "job" : "jobs"}</h2>
        <Button size="sm" className="gap-1" disabled title="Not wired yet"><Plus className="h-3.5 w-3.5" />Job creation pending</Button>
      </div>
      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="p-8 text-sm text-muted-foreground text-center">No jobs yet</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((j: any) => (
              <TableRow key={j.id} className="cursor-pointer" onClick={() => navigate(`/records/job/${j.id}`)}>
                <TableCell className="font-medium">#{j.job_number}</TableCell>
                <TableCell className="capitalize">{j.job_type || "—"}</TableCell>
                <TableCell><JobStatusBadge status={j.status} /></TableCell>
                <TableCell>{j.scheduled_date ? format(new Date(j.scheduled_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell>{j.assigned_to || "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{j.address || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
