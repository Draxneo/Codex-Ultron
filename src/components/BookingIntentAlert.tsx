/**
 * BookingIntentAlert — Realtime listener that surfaces an immediate "Book It Now"
 * popup card whenever an action_item with booking intent is inserted.
 * Sources: phone calls, SMS/MMS, voicemails, emails.
 *
 * FIX #5: Skips SMS-sourced alerts when JARVIS copilot is open to avoid double-prompting.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus, X, Loader2, Phone, MessageSquare, Mail, Voicemail,
  MapPin, User, Wrench, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { useBookingAction } from "@/hooks/useBookingAction";
import {
  ACTION_ITEM_STATUS,
  invalidateActionItemQueues,
  resolveActionItem,
} from "@/lib/actionItemLifecycle";

const BOOKING_CATEGORIES = ["new_appointment", "booking_confirm"];

type BookingAlert = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  source: string;
  priority: string;
  customer_phone: string | null;
  metadata: any;
  created_at: string;
};

const SOURCE_ICON: Record<string, React.ElementType> = {
  call: Phone,
  phone: Phone,
  sms: MessageSquare,
  voicemail: Voicemail,
  email: Mail,
};

/* ── Detail row helper ── */
function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

export function BookingIntentAlert() {
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { open: copilotOpen } = useCopilotPanel();
  const { book, getState, reset } = useBookingAction();
  const copilotOpenRef = useRef(copilotOpen);
  const [propertySelections, setPropertySelections] = useState<Record<string, any>>({});
  copilotOpenRef.current = copilotOpen;

  // Subscribe to new booking-intent action_items
  useEffect(() => {
    const channel = supabase
      .channel("booking-intent-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "action_items",
        },
        async (payload: any) => {
          const row = payload.new;
          if (row?.status === ACTION_ITEM_STATUS.pending && BOOKING_CATEGORIES.includes(row.category)) {
            const isSmsSource = row.source === "sms";
            if (isSmsSource && copilotOpenRef.current) {
              console.log("[BookingIntentAlert] Skipping SMS alert — copilot is open");
              return;
            }

            // FRONTEND SAFETY NET: skip popup if caller has an active job in progress.
            // Protects against legacy action_items or code paths that bypass the
            // server-side active-job suppression check.
            const phone =
              row.customer_phone ||
              (row.metadata as any)?.customer_phone ||
              (row.metadata as any)?.phone;
            if (phone) {
              const digits = String(phone).replace(/\D/g, "").slice(-10);
              if (digits.length === 10) {
                try {
                  const { data: activeJob } = await supabase
                    .rpc("find_job_by_phone", { digits })
                    .maybeSingle();
                  if (activeJob) {
                    console.log(
                      "[BookingIntentAlert] Suppressed — caller has active job",
                      activeJob
                    );
                    return;
                  }
                } catch (e) {
                  console.warn(
                    "[BookingIntentAlert] active-job check failed, showing alert anyway",
                    e
                  );
                }
              }
            }

            setAlerts((prev) => {
              if (prev.some((a) => a.id === row.id)) return prev;
              return [
                {
                  id: row.id,
                  title: row.title,
                  description: row.description,
                  category: row.category,
                  source: row.source || "jarvis",
                  priority: row.priority || "normal",
                  customer_phone: row.customer_phone,
                  metadata: row.metadata,
                  created_at: row.created_at,
                },
                ...prev,
              ].slice(0, 5);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleBookIt = useCallback(
    async (alert: BookingAlert) => {
      const result = await book({
        action_item_id: alert.id,
        metadata: {
          ...(alert.metadata || {}),
          ...(propertySelections[alert.id] ? {
            address: propertySelections[alert.id].address || propertySelections[alert.id].formatted,
            address_id: propertySelections[alert.id].id || null,
            requires_property_selection: false,
            selected_property_label: propertySelections[alert.id].label || null,
          } : {}),
        },
        description: alert.description,
        customer_phone: alert.customer_phone,
      });
      if (result.ok) {
        // Auto-dismiss after success state shows briefly
        setTimeout(() => {
          dismiss(alert.id);
          setPropertySelections((prev) => {
            const next = { ...prev };
            delete next[alert.id];
            return next;
          });
          reset(alert.id);
        }, 2500);
      }
    },
    [book, dismiss, propertySelections, reset]
  );

  const handleDismiss = useCallback(
    async (alert: BookingAlert) => {
      await resolveActionItem({
        id: alert.id,
        status: ACTION_ITEM_STATUS.dismissed,
        userId: user?.id,
        title: alert.title,
      });

      invalidateActionItemQueues(qc);
      dismiss(alert.id);
      setPropertySelections((prev) => {
        const next = { ...prev };
        delete next[alert.id];
        return next;
      });
      reset(alert.id);
    },
    [user, qc, dismiss, reset]
  );

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {alerts.map((alert, i) => {
        const SourceIcon = SOURCE_ICON[alert.source] || CalendarPlus;
        const m = (alert.metadata || {}) as any;
        const state = getState(alert.id);
        const phase = state.phase;
        const isWorking = phase === "resolving" || phase === "booking" || phase === "syncing";
        const isDone = phase === "booked" || phase === "syncing";
        const isFailed = phase === "failed";
        const phone = m.customer_phone || m.phone || alert.customer_phone;
        const propertyOptions = Array.isArray(m.property_options) ? m.property_options : [];
        const selectedProperty = propertySelections[alert.id];
        const needsPropertySelection =
          !!m.requires_property_selection && propertyOptions.length > 0 && !selectedProperty;

        return (
          <div
            key={alert.id}
            className={cn(
              "pointer-events-auto rounded-xl border bg-card shadow-2xl p-4 space-y-3 animate-in slide-in-from-bottom-4 fade-in duration-300 max-h-[80vh] overflow-y-auto",
              alert.priority === "critical" && "border-destructive/50 ring-1 ring-destructive/20",
              alert.priority === "high" && "border-amber-500/50 ring-1 ring-amber-500/20"
            )}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <SourceIcon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-foreground">{alert.title}</p>
                {alert.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                )}
              </div>
              <button
                onClick={() => handleDismiss(alert)}
                className="text-muted-foreground/60 hover:text-foreground p-0.5 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Context pills */}
            <div className="flex flex-wrap gap-1.5">
              {m.customer_name && (
                <span className="text-[10px] font-medium bg-muted px-2 py-0.5 rounded-full">
                  {m.customer_name}
                </span>
              )}
              {m.job_type && (
                <span className="text-[10px] font-medium bg-accent/50 text-accent-foreground px-2 py-0.5 rounded-full">
                  {m.job_type}
                </span>
              )}
              {m.scheduled_date && (
                <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {m.scheduled_date} {m.scheduled_time || ""}
                </span>
              )}
            </div>

            {/* Expanded detail rows */}
            <div className="space-y-1.5 border-t border-border/50 pt-2">
              {phone && <DetailRow icon={Phone} label="Phone" value={phone} />}
              {m.customer_email && <DetailRow icon={Mail} label="Email" value={m.customer_email} />}
              {m.address && <DetailRow icon={MapPin} label="Address" value={m.address} />}
              {(m.scheduled_date || m.scheduled_time) && (
                <DetailRow icon={CalendarPlus} label="Requested" value={`${m.scheduled_date || "No date"} ${m.scheduled_time || ""}`} />
              )}
              {m.scheduling_preference && !m.scheduled_date && (
                <DetailRow icon={CalendarPlus} label="Preference" value={m.scheduling_preference} />
              )}
              <DetailRow icon={User} label="Tech" value={m.assigned_to || "Jonathan (default)"} />
              {(m.description || alert.description) && (
                <DetailRow icon={Wrench} label="Notes" value={m.description || alert.description} />
              )}
            </div>

            {/* Inline error banner */}
            {isFailed && state.error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium">Booking failed</p>
                  <p className="text-destructive/80 break-words">{state.error}</p>
                </div>
              </div>
            )}

            {/* Inline success banner */}
            {isDone && state.result && (
              <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 p-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[hsl(var(--success))]" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {state.result.type === "estimate" ? "Estimate" : "Job"} #
                    {state.result.hcp_job_number || state.result.hcp_estimate_number || state.result.hcp_id}
                    {" "}created in HCP
                  </p>
                  <p className="text-muted-foreground">
                    {phase === "syncing" ? "Syncing to dispatch board…" : "Booked"}
                  </p>
                </div>
              </div>
            )}

            {propertyOptions.length > 0 && m.requires_property_selection && (
              <div className="space-y-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-2">
                <p className="text-[10px] font-medium text-orange-700">
                  Choose service property before booking
                </p>
                {m.mentioned_address && (
                  <p className="text-[11px] text-muted-foreground">Customer mentioned: {m.mentioned_address}</p>
                )}
                <div className="grid gap-1.5">
                  {propertyOptions.map((property: any, index: number) => {
                    const address = property.address || property.formatted;
                    const active = selectedProperty?.id
                      ? selectedProperty.id === property.id
                      : (selectedProperty?.address || selectedProperty?.formatted) === address;
                    return (
                      <Button
                        key={`${property.id || index}-${address}`}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-auto justify-start gap-2 whitespace-normal py-2 text-left"
                        onClick={() => setPropertySelections((prev) => ({ ...prev, [alert.id]: property }))}
                        disabled={isWorking || isDone}
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">{property.label || "Property"}</span>
                          <span className="block text-[11px] opacity-80">{address}</span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action */}
            <Button
              size="sm"
              className="w-full gap-2 bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]"
              onClick={() => handleBookIt(alert)}
              disabled={isWorking || isDone || needsPropertySelection}
            >
              {phase === "resolving" && (<><Loader2 className="h-4 w-4 animate-spin" />Resolving customer…</>)}
              {phase === "booking" && (<><Loader2 className="h-4 w-4 animate-spin" />Booking in HCP…</>)}
              {phase === "syncing" && (<><Loader2 className="h-4 w-4 animate-spin" />Syncing to board…</>)}
              {phase === "booked" && (<><CheckCircle2 className="h-4 w-4" />Booked</>)}
              {(phase === "idle" || phase === "failed") && (
                <><CalendarPlus className="h-4 w-4" />{needsPropertySelection ? "Choose Property" : isFailed ? "Retry Booking" : "Book It Now"}</>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
