import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, ChevronRight, ChevronDown, DollarSign, CheckCircle, Loader2, Undo2, Briefcase, FileText, Lock, Percent, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { getPaysheetBadgeVariant } from "@/lib/statusColors";
import { PAY_CATEGORY_LABELS } from "@/lib/resolvePayCategory";
import { cn } from "@/lib/utils";

interface PayEntry {
  id: string;
  employee_id: string;
  job_id: string;
  amount: number;
  status: string;
  pay_week_start: string;
  pay_week_end: string;
  pay_category: string | null;
  rate_type: string | null;
  hourly_amount: number | null;
  commission_amount: number | null;
  hours_worked: number | null;
  job?: { customer_name: string | null; job_type: string | null; scheduled_date: string | null; job_number: string | null };
  employee?: { name: string };
}

interface WeekJob {
  id: string;
  customer_name: string | null;
  job_type: string | null;
  job_number: string | null;
  scheduled_date: string | null;
  status: string;
  assigned_to: string | null;
}

interface WeekEstimate {
  id: string;
  customer_name: string | null;
  estimate_number: string | null;
  scheduled_date: string | null;
  work_status: string | null;
  assigned_to: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: string | null;
}

function getWeekBounds(offset: number) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

type PaysheetPanelProps = {
  technicianOnly?: boolean;
  lockToCurrentWeek?: boolean;
};

export function PaysheetPanel({ technicianOnly = false, lockToCurrentWeek = false }: PaysheetPanelProps = {}) {
  const { role, employeeId } = useEffectiveAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PayEntry[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [weekJobs, setWeekJobs] = useState<WeekJob[]>([]);
  const [weekEstimates, setWeekEstimates] = useState<WeekEstimate[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bulkUpdating, setBulkUpdating] = useState<string | null>(null);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const isAdmin = role === "admin";

  const { start, end } = getWeekBounds(weekOffset);
  const showGrouped = !technicianOnly && (role === "admin" || role === "office");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    if (technicianOnly && !employeeId) {
      setEntries([]);
      setAllEmployees([]);
      setWeekJobs([]);
      setWeekEstimates([]);
      setLoading(false);
      return;
    }

    if (showGrouped) {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, name, role")
        .eq("is_active", true)
        .order("name");
      setAllEmployees((emps || []) as Employee[]);
    }

    // Fetch paysheet entries
    let query = supabase
      .from("paysheet_entries")
      .select("*, job:jobs(customer_name, job_type, scheduled_date, job_number)")
      .eq("pay_week_start", start)
      .eq("pay_week_end", end)
      .order("created_at", { ascending: false });

    if ((technicianOnly || role === "tech" || role === "supervisor") && employeeId) {
      query = query.eq("employee_id", employeeId);
    }

    const { data } = await query;

    if (data && showGrouped) {
      const empIds = [...new Set(data.map(e => e.employee_id).filter(Boolean))];
      let empMap: Record<string, any> = {};
      if (empIds.length > 0) {
        const { data: emps } = await supabase.from("employees").select("id, name").in("id", empIds);
        empMap = Object.fromEntries((emps || []).map(e => [e.id, e]));
      }
      setEntries(data.map(d => ({ ...d, employee: empMap[d.employee_id] })) as PayEntry[]);
    } else {
      setEntries((data || []) as PayEntry[]);
    }

    // Fetch all jobs for the week
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, customer_name, job_type, job_number, scheduled_date, status, assigned_to")
      .gte("scheduled_date", start)
      .lte("scheduled_date", end)
      .not("status", "in", '("canceled")')
      .order("scheduled_date", { ascending: true });
    setWeekJobs((jobs || []) as WeekJob[]);

    // Fetch all estimates for the week
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id, customer_name, estimate_number, scheduled_date, work_status, assigned_to")
      .gte("scheduled_date", start)
      .lte("scheduled_date", end)
      .order("scheduled_date", { ascending: true });
    setWeekEstimates((estimates || []) as WeekEstimate[]);

    setLoading(false);
  }, [showGrouped, start, end, role, employeeId, technicianOnly]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const nonHeldEntries = entries.filter(e => e.status !== "held");
  const heldEntries = entries.filter(e => e.status === "held");
  const total = nonHeldEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const heldTotal = heldEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalHours = entries.reduce((s, e) => s + ((e as any).hours_worked || 0), 0);
  const totalHourly = entries.reduce((s, e) => s + ((e as any).hourly_amount || 0), 0);
  const totalCommission = entries.reduce((s, e) => s + ((e as any).commission_amount || 0), 0);

  const statusColor = (status: string) => getPaysheetBadgeVariant(status);

  const bulkUpdateStatus = async (empId: string, newStatus: string) => {
    const empEntries = entries.filter(e => e.employee_id === empId);
    if (empEntries.length === 0) return;
    setBulkUpdating(`${empId}_${newStatus}`);
    const ids = empEntries.map(e => e.id);
    const { error } = await supabase.from("paysheet_entries").update({ status: newStatus }).in("id", ids);
    if (error) {
      toast({ title: "Error updating", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Marked ${empEntries.length} entries as ${newStatus}` });
      setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, status: newStatus } : e));
    }
    setBulkUpdating(null);
  };

  const bulkUpdateAll = async (newStatus: string) => {
    const targetEntries = entries.filter(e => e.status !== newStatus);
    if (targetEntries.length === 0) return;
    setBulkUpdating(`all_${newStatus}`);
    const ids = targetEntries.map(e => e.id);
    const { error } = await supabase.from("paysheet_entries").update({ status: newStatus }).in("id", ids);
    if (error) {
      toast({ title: "Error updating", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Marked all ${targetEntries.length} entries as ${newStatus}` });
      setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, status: newStatus } : e));
    }
    setBulkUpdating(null);
  };

  // Match jobs/estimates to employees by name (assigned_to stores the tech name)
  const getEmpJobs = (empName: string) =>
    weekJobs.filter(j => j.assigned_to?.toLowerCase().includes(empName.toLowerCase()));
  const getEmpEstimates = (empName: string) =>
    weekEstimates.filter(e => e.assigned_to?.toLowerCase().includes(empName.toLowerCase()));

  const groupedByEmployee: Record<string, { name: string; role: string | null; entries: PayEntry[]; total: number }> = {};
  if (showGrouped) {
    allEmployees.forEach(emp => {
      groupedByEmployee[emp.id] = { name: emp.name, role: emp.role, entries: [], total: 0 };
    });
  }
  entries.forEach(entry => {
    const empId = entry.employee_id;
    const empName = entry.employee?.name || "You";
    if (!groupedByEmployee[empId]) {
      groupedByEmployee[empId] = { name: empName, role: null, entries: [], total: 0 };
    }
    groupedByEmployee[empId].entries.push(entry);
    groupedByEmployee[empId].total += entry.amount || 0;
  });

  const employeeGroups = Object.entries(groupedByEmployee).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        {lockToCurrentWeek ? (
          <div className="h-10 w-10" />
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Pay Week</p>
          <p className="font-semibold">{format(new Date(start), "M/d/yyyy")} — {format(new Date(end), "M/d/yyyy")}</p>
        </div>
        {lockToCurrentWeek ? (
          <div className="h-10 w-10" />
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Grand Total */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="font-medium">{showGrouped ? "Grand Total" : "Total"}</span>
            </div>
            <span className="text-2xl font-bold">${total.toFixed(2)}</span>
          </div>
           {heldTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Held (awaiting payment)</span>
              <span>${heldTotal.toFixed(2)}</span>
            </div>
          )}
          {(totalHours > 0 || totalHourly > 0) && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
              {totalHours > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {totalHours.toFixed(1)} hrs</span>
              )}
              {totalHourly > 0 && (
                <span>Hourly: ${totalHourly.toFixed(2)}</span>
              )}
              {totalCommission > 0 && (
                <span>Commission: ${totalCommission.toFixed(2)}</span>
              )}
            </div>
          )}
          {isAdmin && entries.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={bulkUpdating === "all_approved" || entries.every(e => e.status === "approved" || e.status === "paid")} onClick={() => bulkUpdateAll("approved")}>
                {bulkUpdating === "all_approved" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                Approve All
              </Button>
              <Button variant="default" size="sm" className="flex-1 text-xs" disabled={bulkUpdating === "all_paid" || entries.every(e => e.status === "paid")} onClick={() => bulkUpdateAll("paid")}>
                {bulkUpdating === "all_paid" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <DollarSign className="h-3 w-3 mr-1" />}
                Mark All Paid
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entries */}
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : showGrouped ? (
        <div className="space-y-3">
          {employeeGroups.map(([empId, group]) => {
            const allApproved = group.entries.length > 0 && group.entries.every(e => e.status === "approved" || e.status === "paid");
            const allPaid = group.entries.length > 0 && group.entries.every(e => e.status === "paid");
            const allPending = group.entries.length > 0 && group.entries.every(e => e.status === "pending");
            const hasNonPending = group.entries.some(e => e.status !== "pending");
            const isExpanded = expandedEmp === empId;
            const empJobs = getEmpJobs(group.name);
            const empEstimates = getEmpEstimates(group.name);
            const activityCount = empJobs.length + empEstimates.length;

            return (
              <Collapsible key={empId} open={isExpanded} onOpenChange={() => setExpandedEmp(isExpanded ? null : empId)}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-2 pt-4 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                          <div>
                            <CardTitle className="text-sm font-semibold">{group.name}</CardTitle>
                            {group.role && <p className="text-[10px] text-muted-foreground capitalize">{group.role}</p>}
                          </div>
                        </div>
                        <span className="text-lg font-bold">${group.total.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
                        <span>{group.entries.length} pay entr{group.entries.length !== 1 ? "ies" : "y"}</span>
                        {(() => {
                          const empHours = group.entries.reduce((s, e) => s + ((e as any).hours_worked || 0), 0);
                          return empHours > 0 ? <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {empHours.toFixed(1)}h</span> : null;
                        })()}
                        {activityCount > 0 && (
                          <span className="text-primary">· {activityCount} job{activityCount !== 1 ? "s" : ""}/estimate{activityCount !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="px-4 pb-3 space-y-3">
                      {/* Pay Entries */}
                      {group.entries.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> Pay Entries
                          </p>
                          <div className="space-y-1">
                            {group.entries.map(entry => (
                              <div key={entry.id} className={cn("flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50", entry.status === "held" && "opacity-60")}>
                                <div className="text-sm">
                                  <p>
                                    {entry.job?.customer_name || "Unknown"}{" "}
                                    <span className="text-muted-foreground text-xs">
                                      · {entry.rate_type === "hourly" ? "Hourly" : (entry.pay_category ? (PAY_CATEGORY_LABELS[entry.pay_category] || entry.pay_category) : entry.job?.job_type)}
                                    </span>
                                  </p>
                                  {entry.rate_type === "hourly" && entry.hours_worked ? (
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                      <Clock className="h-2.5 w-2.5" /> {entry.hours_worked.toFixed(1)}h × ${((entry.hourly_amount || 0) / (entry.hours_worked || 1)).toFixed(0)}/hr
                                    </p>
                                  ) : entry.status === "held" ? (
                                    <p className="text-[10px] text-destructive flex items-center gap-0.5 mt-0.5">
                                      <Lock className="h-2.5 w-2.5" /> Awaiting customer payment
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  {entry.rate_type === "percentage" && <Percent className="h-3 w-3 text-muted-foreground" />}
                                  {entry.rate_type === "hourly" && <Clock className="h-3 w-3 text-muted-foreground" />}
                                  <Badge variant={statusColor(entry.status)} className="text-[10px]">{entry.status}</Badge>
                                  <span className="font-semibold text-sm">${entry.amount}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Jobs this week */}
                      {empJobs.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                            <Briefcase className="h-3 w-3" /> Jobs This Week
                          </p>
                          <div className="space-y-1">
                            {empJobs.map(job => (
                              <div
                                key={job.id}
                                onClick={() => navigate(`/jobs/${job.id}`)}
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                              >
                                <div className="text-sm">
                                  <span className="font-medium text-primary">#{job.job_number || "—"}</span>{" "}
                                  <span>{job.customer_name || "Unknown"}</span>
                                  <span className="text-muted-foreground text-xs ml-1">· {job.job_type}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={job.status === "done" ? "default" : "outline"} className="text-[10px] capitalize">{job.status}</Badge>
                                  {job.scheduled_date && (
                                    <span className="text-[10px] text-muted-foreground">{format(new Date(job.scheduled_date), "EEE M/d")}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Estimates this week */}
                      {empEstimates.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Estimates This Week
                          </p>
                          <div className="space-y-1">
                            {empEstimates.map(est => (
                              <div
                                key={est.id}
                                onClick={() => navigate(`/estimates/${est.id}`)}
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                              >
                                <div className="text-sm">
                                  <span className="font-medium text-primary">#{est.estimate_number || "—"}</span>{" "}
                                  <span>{est.customer_name || "Unknown"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={est.work_status === "won" ? "default" : "outline"} className="text-[10px] capitalize">{est.work_status || "new"}</Badge>
                                  {est.scheduled_date && (
                                    <span className="text-[10px] text-muted-foreground">{format(new Date(est.scheduled_date), "EEE M/d")}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No activity */}
                      {group.entries.length === 0 && empJobs.length === 0 && empEstimates.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">No activity this week</p>
                      )}

                      {/* Admin bulk actions */}
                      {isAdmin && group.entries.length > 0 && (
                        <div className="flex gap-2 pt-1 border-t">
                          {hasNonPending && (
                            <Button variant="ghost" size="sm" className="text-[11px] h-7 text-muted-foreground" disabled={allPending || bulkUpdating === `${empId}_pending`} onClick={() => bulkUpdateStatus(empId, "pending")}>
                              {bulkUpdating === `${empId}_pending` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Undo2 className="h-3 w-3 mr-1" />}
                              Reset
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="flex-1 text-[11px] h-7" disabled={allApproved || bulkUpdating === `${empId}_approved`} onClick={() => bulkUpdateStatus(empId, "approved")}>
                            {bulkUpdating === `${empId}_approved` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                            Approve
                          </Button>
                          <Button variant="default" size="sm" className="flex-1 text-[11px] h-7" disabled={allPaid || bulkUpdating === `${empId}_paid`} onClick={() => bulkUpdateStatus(empId, "paid")}>
                            {bulkUpdating === `${empId}_paid` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <DollarSign className="h-3 w-3 mr-1" />}
                            Mark Paid
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No entries this week.</div>
      ) : (
        <div className="space-y-2">
           {entries.map(entry => (
            <Card key={entry.id} className={cn(entry.status === "held" && "border-destructive/30 bg-destructive/5")}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {entry.job?.customer_name || "Unknown"}{" "}
                      <span className="text-muted-foreground">
                        · {entry.rate_type === "hourly" ? "Hourly" : (entry.pay_category ? (PAY_CATEGORY_LABELS[entry.pay_category] || entry.pay_category) : entry.job?.job_type)}
                      </span>
                    </p>
                    {entry.rate_type === "hourly" && entry.hours_worked ? (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <Clock className="h-2.5 w-2.5" /> {entry.hours_worked.toFixed(1)}h
                      </p>
                    ) : entry.status === "held" ? (
                      <p className="text-[10px] text-destructive flex items-center gap-0.5 mt-0.5">
                        <Lock className="h-2.5 w-2.5" /> Awaiting customer payment
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.rate_type === "percentage" && <Percent className="h-3 w-3 text-muted-foreground" />}
                    {entry.rate_type === "hourly" && <Clock className="h-3 w-3 text-muted-foreground" />}
                    <Badge variant={statusColor(entry.status)}>{entry.status}</Badge>
                    <span className="font-bold">${entry.amount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
