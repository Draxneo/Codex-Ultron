import { Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees } from "@/hooks/useEmployees";
import { useAddJobTeamMember, useJobTeamMembers, useRemoveJobTeamMember } from "@/hooks/useJobTeamMembers";
import { toast } from "@/hooks/use-toast";

export function JobTeamMembersManager({
  jobId,
  primaryName,
}: {
  jobId?: string | null;
  primaryName?: string | null;
}) {
  const { data: employees = [] } = useEmployees();
  const { data: members = [], isLoading } = useJobTeamMembers(jobId);
  const addMember = useAddJobTeamMember(jobId);
  const removeMember = useRemoveJobTeamMember(jobId);

  const existingNames = new Set([
    primaryName,
    ...members.map((member) => member.employee_name),
  ].filter(Boolean).map((name) => String(name).toLowerCase()));
  const available = employees.filter((employee) => employee.is_active && !existingNames.has(employee.name.toLowerCase()));

  const handleAdd = async (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) return;
    try {
      await addMember.mutateAsync({
        employee_id: employee.id,
        employee_name: employee.name,
        role: "helper",
      });
      toast({ title: "Person added", description: `${employee.name} is now attached to this job.` });
    } catch (error: any) {
      toast({ title: "Could not add person", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const handleRemove = async (id: string, name: string) => {
    try {
      await removeMember.mutateAsync(id);
      toast({ title: "Person removed", description: `${name} was removed from this job.` });
    } catch (error: any) {
      toast({ title: "Could not remove person", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            People on this job
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Use this when two people need to work the same quote or job.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {primaryName ? (
          <Badge className="gap-1.5 px-2 py-1">
            {primaryName}
            <span className="text-[10px] opacity-80">primary</span>
          </Badge>
        ) : (
          <Badge variant="outline">No primary person</Badge>
        )}
        {members.map((member) => (
          <Badge key={member.id} variant="secondary" className="gap-1.5 px-2 py-1">
            {member.employee_name}
            <button
              type="button"
              className="ml-1 rounded-sm opacity-70 hover:opacity-100"
              aria-label={`Remove ${member.employee_name}`}
              onClick={() => handleRemove(member.id, member.employee_name)}
              disabled={removeMember.isPending}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {!isLoading && !members.length && primaryName && (
          <span className="text-xs text-muted-foreground">No extra people added yet.</span>
        )}
      </div>

      <div className="mt-3">
        <Select onValueChange={handleAdd} disabled={!jobId || addMember.isPending || available.length === 0}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={available.length ? "Add another person..." : "Everyone active is already listed"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((employee) => (
              <SelectItem key={employee.id} value={employee.id}>
                {employee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
