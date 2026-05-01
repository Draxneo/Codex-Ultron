import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, MessageSquare, Route, Sparkles, Unlock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  buildRouteSmsDraftBody,
  buildRouteSuggestion,
  type NormalizedRouteStop,
  type RouteSuggestion,
} from "@/lib/routeOptimization";

type RouteBoardItem = {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  customer_id: string | null;
  address: string | null;
  description: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  job_type: string;
  hcp_job_number: string | null;
  job_number: string | null;
  customer_phone: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  estimate_number?: string | null;
  status?: string | null;
  work_status?: string | null;
  hcp_note?: string | null;
  notes?: string | null;
  dispatch_notes?: string | null;
  priority?: number | null;
};

type EmployeeOption = {
  id: string;
  name: string | null;
  is_active?: boolean | null;
};

type CustomerConsent = {
  text_consent: string | null;
  notifications_enabled: boolean | null;
};

type CustomerConsentRow = CustomerConsent & { id: string };
type DbError = { message: string };
type RouteRunInsertResult = { data: { id: string } | null; error: DbError | null };
type DynamicInsert = PromiseLike<{ error: DbError | null }> & {
  select: (columns: string) => {
    single: () => Promise<RouteRunInsertResult>;
  };
};
type DynamicSupabase = {
  from: (table: string) => {
    insert: (values: unknown) => DynamicInsert;
  };
};

type SmsDraftState = {
  stopId: string;
  to: string | null;
  body: string;
  include: boolean;
  warnings: string[];
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  items: RouteBoardItem[];
  employees?: EmployeeOption[];
  routeOrders: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>;
}

function timeLabel(value: string | null) {
  if (!value) return "No time";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return value;
}

function zipFromAddress(address: string | null) {
  return address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) || null;
}

function stopTitle(stop: NormalizedRouteStop) {
  return stop.customerName || stop.reference || "Unnamed stop";
}

function currentOrderFor(item: RouteBoardItem, routeOrders: Props["routeOrders"], fallbackOrder: number) {
  return routeOrders.get(item.id)?.order ?? fallbackOrder;
}

function buildOptimizerInputs(items: RouteBoardItem[], employees?: EmployeeOption[]) {
  const employeeByName = new Map(
    (employees || [])
      .filter((employee) => employee.name)
      .map((employee) => [employee.name!.trim().toLowerCase(), employee])
  );

  return items.map((item, index) => {
    const employee = item.assigned_to ? employeeByName.get(item.assigned_to.trim().toLowerCase()) : null;
    return {
      ...item,
      kind: item.item_type,
      technician_id: employee?.id || null,
      technicianName: item.assigned_to,
      zip: zipFromAddress(item.address),
      notes: [item.notes, item.dispatch_notes, item.hcp_note, item.description].filter(Boolean).join(" "),
      priority: item.priority ?? (item.status === "urgent" ? 10 : 0),
      original_index: index,
    };
  });
}

function isTextAllowed(customerId: string | null, consent: Map<string, CustomerConsent>) {
  if (!customerId) return { allowed: true, warning: "Consent unknown: no linked customer record." };
  const row = consent.get(customerId);
  if (!row) return { allowed: true, warning: "Consent unknown: customer preferences not loaded." };
  if (row.notifications_enabled === false) return { allowed: false, warning: "Customer notifications are disabled." };
  if (row.text_consent === "opted_out") return { allowed: false, warning: "Customer is opted out of SMS." };
  if (row.text_consent !== "opted_in") return { allowed: true, warning: "SMS consent is not explicitly opted in." };
  return { allowed: true, warning: null };
}

const dynamicSupabase = supabase as unknown as DynamicSupabase;

export function MorningRouteOptimizerDialog({ open, onOpenChange, date, items, employees, routeOrders }: Props) {
  const { user } = useAuth();
  const [customerConsent, setCustomerConsent] = useState<Map<string, CustomerConsent>>(new Map());
  const [smsDrafts, setSmsDrafts] = useState<SmsDraftState[]>([]);
  const [saving, setSaving] = useState(false);

  const todayItems = useMemo(
    () => items.filter((item) => item.scheduled_date === date && item.assigned_to && item.address),
    [date, items]
  );

  const inputs = useMemo(() => buildOptimizerInputs(todayItems, employees), [employees, todayItems]);
  const suggestion: RouteSuggestion = useMemo(() => buildRouteSuggestion(inputs), [inputs]);

  const itemById = useMemo(() => new Map(todayItems.map((item, index) => [item.id, { item, index }])), [todayItems]);

  useEffect(() => {
    if (!open) return;
    const ids = Array.from(new Set(todayItems.map((item) => item.customer_id).filter(Boolean))) as string[];
    if (ids.length === 0) {
      setCustomerConsent(new Map());
      return;
    }

    void supabase
      .from("customers")
      .select("id, text_consent, notifications_enabled")
      .in("id", ids)
      .then(({ data }) => {
        const next = new Map<string, CustomerConsent>();
        (data || []).forEach((row) => {
          const typed = row as CustomerConsentRow;
          next.set(typed.id, {
            text_consent: typed.text_consent ?? null,
            notifications_enabled: typed.notifications_enabled ?? null,
          });
        });
        setCustomerConsent(next);
      });
  }, [open, todayItems]);

  useEffect(() => {
    if (!open) return;
    const nextDrafts: SmsDraftState[] = [];
    for (const group of suggestion.groups) {
      for (const suggested of group.suggestedStops) {
        const { item } = itemById.get(suggested.stop.id) || {};
        const consent = isTextAllowed(item?.customer_id || null, customerConsent);
        const body = buildRouteSmsDraftBody(suggested.stop, suggested.suggestedOrder, {
          companyName: "Carnes and Sons",
          includeStopNumber: true,
          technicianName: group.technicianName || undefined,
        });
        nextDrafts.push({
          stopId: suggested.stop.id,
          to: suggested.stop.customerPhone,
          body,
          include: Boolean(suggested.stop.customerPhone && consent.allowed),
          warnings: [
            ...suggested.warnings.filter((warning) => warning.toLowerCase().includes("sms") || warning.toLowerCase().includes("phone")),
            ...(consent.warning ? [consent.warning] : []),
          ],
        });
      }
    }
    setSmsDrafts(nextDrafts);
  }, [customerConsent, itemById, open, suggestion]);

  const includedDrafts = smsDrafts.filter((draft) => draft.include && draft.to && draft.body.trim());
  const totalStops = suggestion.groups.reduce((sum, group) => sum + group.suggestedStops.length, 0);
  const movableStops = suggestion.groups.reduce(
    (sum, group) => sum + group.suggestedStops.filter((suggested) => !suggested.stop.fixed).length,
    0
  );
  const warnings = Array.from(new Set(suggestion.groups.flatMap((group) => group.warnings)));

  const updateDraft = (stopId: string, patch: Partial<SmsDraftState>) => {
    setSmsDrafts((prev) => prev.map((draft) => draft.stopId === stopId ? { ...draft, ...patch } : draft));
  };

  const handleQueueSms = async () => {
    if (includedDrafts.length === 0) {
      toast({ title: "No SMS selected", description: "Select at least one customer update to queue." });
      return;
    }
    setSaving(true);
    try {
      const runInsert = {
        date,
        dispatcher_id: user?.id || null,
        status: "sms_queued",
        approved_at: new Date().toISOString(),
      };
      const { data: run, error: runError } = await dynamicSupabase
        .from("route_optimization_runs")
        .insert(runInsert)
        .select("id")
        .single();
      if (runError) throw runError;
      const runId = run?.id;

      const suggestionRows = suggestion.groups.flatMap((group) =>
        group.suggestedStops.map((suggested) => {
          const source = itemById.get(suggested.stop.id);
          return {
            run_id: runId,
            technician_id: suggested.stop.technicianId,
            job_id: suggested.stop.kind === "job" ? suggested.stop.id : null,
            current_order: source ? currentOrderFor(source.item, routeOrders, source.index + 1) : null,
            suggested_order: suggested.suggestedOrder,
            current_start_time: suggested.stop.arrivalStart,
            suggested_start_time: suggested.stop.arrivalStart,
            locked: suggested.stop.fixed,
            flexibility_reason: suggested.stop.detection.reasons.join(" "),
            optimization_reason: suggested.reasons.join(" "),
            warning: suggested.warnings.join(" "),
          };
        })
      );
      if (suggestionRows.length > 0) {
        const { error } = await dynamicSupabase.from("route_optimization_suggestions").insert(suggestionRows);
        if (error) throw error;
      }

      const draftRows = includedDrafts.map((draft) => {
        const source = itemById.get(draft.stopId)?.item;
        return {
          channel: "sms",
          recipient: draft.to!,
          body: draft.body.trim(),
          job_id: source?.item_type === "job" ? source.id : null,
          source: "route_optimizer",
          status: "pending",
          metadata: {
            route_run_id: runId,
            date,
            item_id: draft.stopId,
            item_type: source?.item_type,
            customer_id: source?.customer_id || null,
            customer_name: source?.customer_name || null,
          },
        };
      });

      const queueRows = includedDrafts.map((draft) => {
        const source = itemById.get(draft.stopId)?.item;
        return {
          run_id: runId,
          job_id: source?.item_type === "job" ? source.id : null,
          customer_id: source?.customer_id || null,
          phone_number: draft.to!,
          message_type: "morning_order_update",
          message_body: draft.body.trim(),
          status: "pending_approval",
          approved_by: null,
        };
      });
      const { error: queueError } = await dynamicSupabase.from("route_sms_queue").insert(queueRows);
      if (queueError) throw queueError;

      const { error: draftError } = await supabase.from("outbound_drafts").insert(draftRows as never);
      if (draftError) throw draftError;

      toast({
        title: "Route SMS queued",
        description: `${includedDrafts.length} editable SMS draft${includedDrafts.length === 1 ? "" : "s"} sent to JARVIS approval.`,
      });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: "Could not queue route updates",
        description: error instanceof Error ? error.message : "The route suggestion stayed unchanged.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <DialogTitle>Morning Route Optimizer</DialogTitle>
          </div>
          <DialogDescription>
            Review suggested route changes for {format(new Date(`${date}T00:00:00`), "EEEE, MMM d")}. Nothing changes and no texts go out until you approve.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-92px)] grid-cols-1 overflow-hidden lg:grid-cols-[1fr_380px]">
          <div className="overflow-y-auto p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs uppercase text-muted-foreground">Stops reviewed</p>
                <p className="text-2xl font-bold">{totalStops}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs uppercase text-muted-foreground">Movable</p>
                <p className="text-2xl font-bold text-emerald-600">{movableStops}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs uppercase text-muted-foreground">SMS drafts</p>
                <p className="text-2xl font-bold text-primary">{includedDrafts.length}</p>
              </div>
            </div>

            {todayItems.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="font-semibold">No assigned stops with addresses for this day.</p>
                <p className="mt-1 text-sm text-muted-foreground">Assign technicians and addresses first, then run the optimizer.</p>
              </div>
            ) : suggestion.groups.map((group) => (
              <section key={group.key} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                  <div>
                    <h3 className="font-semibold">{group.technicianName || "Unassigned technician"}</h3>
                    <p className="text-xs text-muted-foreground">{group.zip ? `ZIP cluster ${group.zip}` : "Multiple ZIP clusters"}</p>
                  </div>
                  <Badge variant="outline">{group.suggestedStops.length} stop{group.suggestedStops.length === 1 ? "" : "s"}</Badge>
                </div>

                <div className="divide-y">
                  {group.suggestedStops.map((suggested) => {
                    const source = itemById.get(suggested.stop.id);
                    const currentOrder = source ? currentOrderFor(source.item, routeOrders, source.index + 1) : suggested.suggestedOrder;
                    const changed = currentOrder !== suggested.suggestedOrder;
                    return (
                      <div key={suggested.stop.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={changed ? "default" : "secondary"}>#{suggested.suggestedOrder}</Badge>
                              <p className="font-semibold">{stopTitle(suggested.stop)}</p>
                              <Badge variant="outline">{suggested.stop.reference || suggested.stop.kind}</Badge>
                              {suggested.stop.fixed ? (
                                <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1"><Unlock className="h-3 w-3" /> {suggested.stop.flexibility}</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {suggested.stop.address || "No address"} - {timeLabel(suggested.stop.arrivalStart)}
                              {suggested.stop.arrivalEnd ? `-${timeLabel(suggested.stop.arrivalEnd)}` : ""}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {suggested.reasons.slice(0, 3).map((reason) => (
                                <span key={reason} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                                  {reason}
                                </span>
                              ))}
                            </div>
                            {suggested.warnings.length > 0 && (
                              <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{suggested.warnings.join(" ")}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Current #{currentOrder}</p>
                            {changed ? <p className="font-semibold text-primary">Suggested move</p> : <p>No move</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Review warnings</p>
                <ul className="mt-2 list-disc pl-5">
                  {warnings.slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}
          </div>

          <aside className="border-t bg-muted/20 lg:border-l lg:border-t-0 overflow-y-auto">
            <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Editable SMS Queue</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">These become pending drafts for approval. They do not auto-send.</p>
            </div>

            <div className="space-y-3 p-4">
              {smsDrafts.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No SMS drafts available.</p>
              ) : smsDrafts.map((draft) => {
                const source = itemById.get(draft.stopId)?.item;
                return (
                  <div key={draft.stopId} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={draft.include}
                        disabled={!draft.to}
                        onCheckedChange={(checked) => updateDraft(draft.stopId, { include: checked === true })}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{source?.customer_name || draft.to || "No phone"}</p>
                        <p className="text-xs text-muted-foreground">{draft.to || "Missing phone number"}</p>
                      </div>
                    </div>
                    <Textarea
                      value={draft.body}
                      onChange={(event) => updateDraft(draft.stopId, { body: event.target.value })}
                      className="min-h-[112px] text-xs"
                    />
                    {draft.warnings.length > 0 && (
                      <div className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        {draft.warnings.join(" ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 border-t bg-background p-4 space-y-2">
              <Button className="w-full gap-2" disabled={saving || includedDrafts.length === 0} onClick={handleQueueSms}>
                {saving ? <Sparkles className="h-4 w-4 animate-pulse" /> : <CheckCircle2 className="h-4 w-4" />}
                Queue {includedDrafts.length} SMS for approval
              </Button>
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                Close without changes
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
