import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Calendar, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface Props {
  appointments: any[];
}

export function UpcomingAppointments({ appointments }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="p-4 shadow-none border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Upcoming appointments</h3>
        <Button size="sm" variant="outline" className="gap-1 h-7" disabled title="Not wired yet">
          <Plus className="h-3.5 w-3.5" />
          Job workflow pending
        </Button>
      </div>
      {appointments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No upcoming appointments</p>
        </div>
      ) : (
        <div className="divide-y">
          {appointments.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(`/jobs/${a.id}`)}
              className="w-full text-left py-2.5 hover:bg-muted/40 px-2 -mx-2 rounded transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">#{a.job_number}</span>
                    <JobStatusBadge status={a.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{a.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium">
                    {a.scheduled_date && format(new Date(a.scheduled_date), "MMM d")}
                  </div>
                  {a.assigned_to && <div className="text-[11px] text-muted-foreground">{a.assigned_to}</div>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
