import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Clock, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, MapPin, Car, Pencil, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useEmployees";

interface TimeEntry {
  id: string;
  employee_id: string;
  job_id: string;
  work_date: string;
  arrived_at: string;
  departed_at: string | null;
  time_on_site_min: number;
  drive_time_min: number | null;
  source: string;
  override_note: string | null;
  job?: { customer_name: string | null; job_number: string | null; job_type: string | null };
}

export function TimeTrackerCard() {
  const { data: employees } = useEmployees();
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [dateOffset, setDateOffset] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ arrived_at?: string; departed_at?: string; override_note?: string }>({});
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);

  const activeEmps = (employees || []).filter((e: any) => e.is_active !== false);

  useEffect(() => {
    if (!selectedEmpId && activeEmps.length > 0) setSelectedEmpId(activeEmps[0].id);
  }, [activeEmps, selectedEmpId]);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  const dateStr = targetDate.toISOString().split("T")[0];

  useEffect(() => {
    if (!selectedEmpId) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("time_entries" as any)
        .select("*, job:jobs(customer_name, job_number, job_type)")
        .eq("employee_id", selectedEmpId)
        .eq("work_date", dateStr)
        .order("arrived_at", { ascending: true }),
      supabase
        .from("tech_location_events")
        .select("event_type, created_at")
        .eq("employee_id", selectedEmpId)
        .in("event_type", ["clock_in", "clock_out"])
        .gte("created_at", `${dateStr}T00:00:00`)
        .lt("created_at", `${dateStr}T23:59:59.999`)
        .order("created_at", { ascending: true }),
    ]).then(([entriesRes, eventsRes]) => {
      setEntries((entriesRes.data || []) as unknown as TimeEntry[]);
      // Use clock events if available, otherwise fall back to time entries
      const clockEvents = eventsRes.data || [];
      const clockInEvt = clockEvents.find((e: any) => e.event_type === "clock_in");
      const clockOutEvt = [...(clockEvents as any[])].reverse().find((e: any) => e.event_type === "clock_out");
      setClockInTime(clockInEvt?.created_at || null);
      setClockOutTime(clockOutEvt?.created_at || null);
      setLoading(false);
    });
  }, [selectedEmpId, dateStr]);




  // Clock-in: prefer event, fallback to first entry arrived_at
  const clockIn = clockInTime || (entries.length > 0 ? entries[0].arrived_at : null);
  // Clock-out: prefer event, fallback to last entry departed_at
  const clockOut = clockOutTime || (entries.length > 0 ? entries[entries.length - 1].departed_at : null);
  const totalSiteMin = entries.reduce((s, e) => s + (e.time_on_site_min || 0), 0);
  const totalDriveMin = entries.reduce((s, e) => s + (e.drive_time_min || 0), 0);
  const totalHours = ((totalSiteMin + totalDriveMin) / 60);

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    try { return format(parseISO(iso), "h:mm a"); } catch { return "—"; }
  };
  const formatMin = (min: number) => {
    if (min < 60) return `${Math.round(min)}m`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const handleSaveOverride = async (entry: TimeEntry) => {
    const updates: any = { override_note: editValues.override_note || null };
    if (editValues.arrived_at) {
      const newArrived = new Date(`${dateStr}T${editValues.arrived_at}`);
      updates.arrived_at = newArrived.toISOString();
    }
    if (editValues.departed_at) {
      const newDeparted = new Date(`${dateStr}T${editValues.departed_at}`);
      updates.departed_at = newDeparted.toISOString();
    }
    if (updates.arrived_at && updates.departed_at) {
      updates.time_on_site_min = Math.max(0, (new Date(updates.departed_at).getTime() - new Date(updates.arrived_at).getTime()) / 60000);
    } else if (updates.arrived_at && entry.departed_at) {
      updates.time_on_site_min = Math.max(0, (new Date(entry.departed_at).getTime() - new Date(updates.arrived_at).getTime()) / 60000);
    } else if (updates.departed_at && entry.arrived_at) {
      updates.time_on_site_min = Math.max(0, (new Date(updates.departed_at).getTime() - new Date(entry.arrived_at).getTime()) / 60000);
    }

    const { error } = await supabase.from("time_entries" as any).update(updates).eq("id", entry.id);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Time entry updated" });
      setEditingId(null);
      // Refresh
      const { data } = await supabase
        .from("time_entries" as any)
        .select("*, job:jobs(customer_name, job_number, job_type)")
        .eq("employee_id", selectedEmpId)
        .eq("work_date", dateStr)
        .order("arrived_at", { ascending: true });
      setEntries((data || []) as unknown as TimeEntry[]);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Time Tracker
        </CardTitle>
        <CardDescription className="text-xs">
          Daily timeline derived from tech form timestamps. Override times as needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {activeEmps.map((emp: any) => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setDateOffset(d => d - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{format(targetDate, "EEE, MMM d yyyy")}</span>
          <Button variant="ghost" size="icon" onClick={() => setDateOffset(d => d + 1)} disabled={dateOffset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary strip */}
        {entries.length > 0 && (
          <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Clock In</p>
              <p className="font-semibold">{formatTime(clockIn)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Clock Out</p>
              <p className="font-semibold">{formatTime(clockOut)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">On Site</p>
              <p className="font-semibold">{formatMin(totalSiteMin)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Drive</p>
              <p className="font-semibold">{formatMin(totalDriveMin)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total</p>
              <p className="font-bold text-primary">{totalHours.toFixed(1)}h</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No time entries for this day</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, idx) => {
              const isEditing = editingId === entry.id;
              const anomalySite = entry.time_on_site_min > 240;
              const anomalyDrive = (entry.drive_time_min || 0) > 60;
              const anomalyGap = (entry.drive_time_min || 0) > 30 && idx > 0;

              return (
                <div key={entry.id} className="space-y-1">
                  {/* Drive gap indicator */}
                  {idx > 0 && entry.drive_time_min != null && (
                    <div className={`flex items-center gap-2 text-xs px-3 py-1 ${anomalyDrive ? "text-amber-600" : "text-muted-foreground"}`}>
                      <Car className="h-3 w-3" />
                      <span>{formatMin(entry.drive_time_min)} drive</span>
                      {anomalyDrive && <AlertTriangle className="h-3 w-3" />}
                    </div>
                  )}

                  <Collapsible>
                    <div className={`rounded-lg border p-3 ${anomalySite ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">
                                #{entry.job?.job_number || "—"} {entry.job?.customer_name || "Unknown"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatTime(entry.arrived_at)} → {formatTime(entry.departed_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{formatMin(entry.time_on_site_min)}</span>
                            {anomalySite && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                            {entry.override_note && <Badge variant="secondary" className="text-[9px]">edited</Badge>}
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Type</span>
                            <p className="capitalize">{entry.job?.job_type || "—"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Source</span>
                            <p className="capitalize">{entry.source}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Site Time</span>
                            <p>{formatMin(entry.time_on_site_min)}</p>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 pt-2 border-t">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-muted-foreground">Arrived</label>
                                <Input
                                  type="time"
                                  className="h-8 text-xs"
                                  defaultValue={entry.arrived_at ? format(parseISO(entry.arrived_at), "HH:mm") : ""}
                                  onChange={e => setEditValues(v => ({ ...v, arrived_at: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground">Departed</label>
                                <Input
                                  type="time"
                                  className="h-8 text-xs"
                                  defaultValue={entry.departed_at ? format(parseISO(entry.departed_at), "HH:mm") : ""}
                                  onChange={e => setEditValues(v => ({ ...v, departed_at: e.target.value }))}
                                />
                              </div>
                            </div>
                            <Input
                              className="h-8 text-xs"
                              placeholder="Override note (reason for change)"
                              defaultValue={entry.override_note || ""}
                              onChange={e => setEditValues(v => ({ ...v, override_note: e.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7 text-xs flex-1" onClick={() => handleSaveOverride(entry)}>
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs w-full"
                            onClick={() => { setEditingId(entry.id); setEditValues({}); }}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Adjust Times
                          </Button>
                        )}

                        {entry.override_note && !isEditing && (
                          <p className="text-[10px] text-amber-600 italic">Note: {entry.override_note}</p>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
