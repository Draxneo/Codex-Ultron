import { useMemo, useState, type ComponentType } from "react";
import { addDays, format, isToday, subDays } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, MessageSquare, Navigation, Phone, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { supabase } from "@/integrations/supabase/client";
import { CLOSED_ESTIMATE_STATUS_FILTER, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";
import { formatPhone } from "@/lib/formatters";
import { launchNavigation } from "@/lib/launchNavigation";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { cn } from "@/lib/utils";

type FieldWork = {
  id: string;
  kind: "job" | "estimate";
  number: string | null;
  customerName: string;
  phone: string | null;
  address: string | null;
  assignedTo: string | null;
  arrivalStart: string | null;
  arrivalEnd: string | null;
  status: string | null;
  workType: string | null;
};

function displayTime(start?: string | null, end?: string | null) {
  const fmt = (value?: string | null) => {
    if (!value) return "";
    try {
      const date = value.includes("T") ? new Date(value) : new Date(`2000-01-01T${value}`);
      return format(date, "h:mm a");
    } catch {
      return value;
    }
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} - ${b}`;
  return a || "No time set";
}

function normalizeEmployeeName(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export default function TechTeamSchedule() {
  const { role, employeeId } = useEffectiveAuth();
  const { data: employees, isLoading: loadingEmployees } = useEmployees();
  const [currentDay, setCurrentDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const currentEmployee = useMemo(() => {
    if (!employeeId || !employees) return null;
    return employees.find((employee) => employee.id === employeeId) || null;
  }, [employeeId, employees]);

  const canViewTeam = role === "supervisor" || role === "admin";
  const currentNameKey = normalizeEmployeeName(currentEmployee?.name);
  const dateStr = format(currentDay, "yyyy-MM-dd");

  const fieldEmployees = useMemo(() => {
    return (employees || [])
      .filter((employee) => employee.is_active !== false)
      .filter((employee) => ["tech", "installer", "supervisor"].includes(String(employee.role || "").toLowerCase()))
      .filter((employee) => normalizeEmployeeName(employee.name) !== currentNameKey)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [currentNameKey, employees]);

  const { data: work = [], isLoading } = useQuery({
    queryKey: ["tech-team-schedule", dateStr],
    enabled: canViewTeam,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FieldWork[]> => {
      const [jobsRes, estimatesRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, job_number, hcp_job_number, customer_name, customer_phone, address, assigned_to, arrival_start, arrival_end, status, job_type")
          .eq("scheduled_date", dateStr)
          .not("status", "in", CLOSED_WORK_STATUS_FILTER),
        supabase
          .from("estimates")
          .select("id, estimate_number, customer_name, customer_phone, address, assigned_to, arrival_start, arrival_end, status, estimate_type")
          .eq("scheduled_date", dateStr)
          .not("status", "in", CLOSED_ESTIMATE_STATUS_FILTER),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (estimatesRes.error) throw estimatesRes.error;

      const jobs = (jobsRes.data || []).map((row: any) => ({
        id: row.id,
        kind: "job" as const,
        number: row.job_number || row.hcp_job_number || null,
        customerName: row.customer_name || "Customer",
        phone: row.customer_phone || null,
        address: row.address || null,
        assignedTo: row.assigned_to || null,
        arrivalStart: row.arrival_start || null,
        arrivalEnd: row.arrival_end || null,
        status: row.status || null,
        workType: row.job_type || null,
      }));

      const estimates = (estimatesRes.data || []).map((row: any) => ({
        id: row.id,
        kind: "estimate" as const,
        number: row.estimate_number || null,
        customerName: row.customer_name || "Customer",
        phone: row.customer_phone || null,
        address: row.address || null,
        assignedTo: row.assigned_to || null,
        arrivalStart: row.arrival_start || null,
        arrivalEnd: row.arrival_end || null,
        status: row.status || null,
        workType: row.estimate_type || "Estimate",
      }));

      return [...jobs, ...estimates].sort((a, b) => (a.arrivalStart || "").localeCompare(b.arrivalStart || ""));
    },
  });

  const workByEmployee = useMemo(() => {
    const map = new Map<string, FieldWork[]>();
    for (const item of work) {
      const key = normalizeEmployeeName(item.assignedTo);
      if (!key || key === currentNameKey) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [currentNameKey, work]);

  const totalVisible = Array.from(workByEmployee.values()).reduce((sum, items) => sum + items.length, 0);

  if (!canViewTeam) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background p-6 text-center">
        <Card className="max-w-sm p-6">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Supervisor view only</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This schedule is for field supervisors who help other techs.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-background pb-4">
      <div className="sticky top-0 z-10 border-b bg-card px-3 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setCurrentDay(subDays(currentDay, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team Schedule</p>
            <h1 className="truncate text-lg font-bold">
              {isToday(currentDay) ? "Today" : format(currentDay, "EEEE")}, {format(currentDay, "MMM d")}
            </h1>
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setCurrentDay(addDays(currentDay, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-10" onClick={() => setCurrentDay(new Date())}>
            <CalendarDays className="mr-2 h-4 w-4" /> Today
          </Button>
          <div className="flex h-10 items-center justify-center rounded-md border bg-muted/40 text-sm font-semibold">
            {totalVisible} open
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        {isLoading || loadingEmployees ? (
          [1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-xl" />)
        ) : fieldEmployees.length === 0 ? (
          <EmptyTeam />
        ) : (
          fieldEmployees.map((employee) => {
            const items = workByEmployee.get(normalizeEmployeeName(employee.name)) || [];
            if (items.length === 0) return null;
            return (
              <section key={employee.id} className="rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold">{employee.name}</h2>
                    <p className="text-xs text-muted-foreground">{items.length} stop{items.length === 1 ? "" : "s"}</p>
                  </div>
                  <Badge variant="secondary">{employee.role}</Badge>
                </div>
                <div className="space-y-2 p-3">
                  {items.map((item) => (
                    <TeamWorkCard key={`${item.kind}-${item.id}`} item={item} />
                  ))}
                </div>
              </section>
            );
          })
        )}
        {!isLoading && !loadingEmployees && totalVisible === 0 && fieldEmployees.length > 0 && <EmptyDay />}
      </div>
    </div>
  );
}

function TeamWorkCard({ item }: { item: FieldWork }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{item.customerName}</p>
            <Badge variant={item.kind === "estimate" ? "outline" : "secondary"} className="shrink-0 text-[10px]">
              {item.kind === "estimate" ? "Estimate" : "Job"}
            </Badge>
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{displayTime(item.arrivalStart, item.arrivalEnd)}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.address || "No address set"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
            {item.number && <span>#{item.number}</span>}
            {item.workType && <span>{item.workType}</span>}
            {item.status && <span>{item.status}</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Action icon={Navigation} label="Nav" disabled={!item.address} onClick={() => item.address && launchNavigation(item.address)} />
        <Action icon={Phone} label="Call" disabled={!item.phone} onClick={() => item.phone && openPhoneConsole(item.phone, { contactName: item.customerName })} />
        <Action icon={MessageSquare} label="Text" disabled={!item.phone} onClick={() => item.phone && openSmsComposer(item.phone, { contactName: item.customerName })} />
      </div>
      {item.phone && <p className="mt-2 text-center text-[11px] text-muted-foreground">{formatPhone(item.phone) || item.phone}</p>}
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-11 flex-col gap-0.5 px-1 text-[10px] font-semibold", disabled && "opacity-45")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function EmptyTeam() {
  return (
    <Card className="p-8 text-center">
      <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-sm font-semibold">No other field team members found</h2>
      <p className="mt-1 text-sm text-muted-foreground">Active techs and installers will show here.</p>
    </Card>
  );
}

function EmptyDay() {
  return (
    <Card className="p-8 text-center">
      <MapPin className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-sm font-semibold">Nobody else has open work that day</h2>
      <p className="mt-1 text-sm text-muted-foreground">Jonathan can stay on his own schedule unless dispatch adds more work.</p>
    </Card>
  );
}
