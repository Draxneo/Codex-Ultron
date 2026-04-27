/**
 * IntakeActionCards — Realtime booking intent cards for the CSR intake popout.
 * Subscribes to action_items filtered by the current caller's phone.
 * Shows inline "Book It Now" cards when JARVIS detects booking intent from transcripts.
 * Falls back to static action buttons (Create Customer, New Job, Look Up) when idle.
 */

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarPlus, Loader2, UserPlus, Briefcase, Search,
  Phone, MessageSquare, Mail, Voicemail, CheckCircle2, AlertTriangle, MapPin, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewJobDialog } from "@/components/NewJobDialog";
import { useBookingAction } from "@/hooks/useBookingAction";
import { useAuth } from "@/hooks/useAuth";
import {
  ACTION_ITEM_STATUS,
  invalidateActionItemQueues,
  resolveActionItem,
} from "@/lib/actionItemLifecycle";
const BOOKING_CATEGORIES = ["new_appointment", "booking_confirm"];

type BookingIntent = {
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

interface IntakeActionCardsProps {
  phoneNumber?: string;
  callerName?: string;
  customerId?: string;
}

export function IntakeActionCards({ phoneNumber, callerName, customerId }: IntakeActionCardsProps) {
  const [intents, setIntents] = useState<BookingIntent[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [propertySelections, setPropertySelections] = useState<Record<string, any>>({});
  const { book, getState, reset } = useBookingAction();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Normalize phone for matching
  const normalizedPhone = phoneNumber?.replace(/\D/g, "").slice(-10) || "";

  // Load existing pending intents on mount
  useEffect(() => {
    if (!normalizedPhone || normalizedPhone.length < 10) return;

    const load = async () => {
      const { data } = await supabase
        .from("action_items")
        .select("*")
        .eq("status", ACTION_ITEM_STATUS.pending)
        .in("category", BOOKING_CATEGORIES)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data) {
        const matched = data.filter((row: any) => {
          const rowDigits = (row.customer_phone || "").replace(/\D/g, "").slice(-10);
          return rowDigits === normalizedPhone;
        });
        setIntents(matched.map(mapRow));
      }
    };
    load();
  }, [normalizedPhone]);

  // Subscribe to new booking intents in realtime
  useEffect(() => {
    const channel = supabase
      .channel("intake-booking-intents")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "action_items" },
        (payload: any) => {
          const row = payload.new;
          if (row?.status !== ACTION_ITEM_STATUS.pending || !BOOKING_CATEGORIES.includes(row.category)) return;
          const rowDigits = (row.customer_phone || "").replace(/\D/g, "").slice(-10);
          if (normalizedPhone && rowDigits === normalizedPhone) {
            setIntents((prev) => {
              if (prev.some((a) => a.id === row.id)) return prev;
              return [mapRow(row), ...prev].slice(0, 5);
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [normalizedPhone]);

  const mapRow = (row: any): BookingIntent => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    source: row.source || "jarvis",
    priority: row.priority || "normal",
    customer_phone: row.customer_phone,
    metadata: row.metadata,
    created_at: row.created_at,
  });

  const handleBookIt = async (intent: BookingIntent) => {
    const result = await book({
      action_item_id: intent.id,
      metadata: {
        ...(intent.metadata || {}),
        ...(propertySelections[intent.id] ? {
          address: propertySelections[intent.id].address || propertySelections[intent.id].formatted,
          address_id: propertySelections[intent.id].id || null,
          requires_property_selection: false,
          selected_property_label: propertySelections[intent.id].label || null,
        } : {}),
      },
      description: intent.description,
      customer_phone: intent.customer_phone,
    });
    if (result.ok) {
      setTimeout(() => {
        setIntents((prev) => prev.filter((a) => a.id !== intent.id));
        setPropertySelections((prev) => {
          const next = { ...prev };
          delete next[intent.id];
          return next;
        });
        reset(intent.id);
      }, 2500);
    }
  };

  const handleDismiss = async (intent: BookingIntent) => {
    await resolveActionItem({
      id: intent.id,
      status: ACTION_ITEM_STATUS.dismissed,
      userId: user?.id,
      title: intent.title,
    });
    invalidateActionItemQueues(qc);
    setIntents((prev) => prev.filter((a) => a.id !== intent.id));
    setPropertySelections((prev) => {
      const next = { ...prev };
      delete next[intent.id];
      return next;
    });
    reset(intent.id);
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Dynamic booking intent cards */}
      {intents.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Booking Intents Detected
          </p>
          {intents.map((intent) => {
            const SourceIcon = SOURCE_ICON[intent.source] || CalendarPlus;
            const m = (intent.metadata || {}) as any;
            const state = getState(intent.id);
            const phase = state.phase;
            const isWorking = phase === "resolving" || phase === "booking" || phase === "syncing";
            const isDone = phase === "booked" || phase === "syncing";
            const isFailed = phase === "failed";
            const propertyOptions = Array.isArray(m.property_options) ? m.property_options : [];
            const selectedProperty = propertySelections[intent.id];
            const needsPropertySelection =
              !!m.requires_property_selection && propertyOptions.length > 0 && !selectedProperty;

            return (
              <div
                key={intent.id}
                className="rounded-lg border bg-card p-3 space-y-2 animate-in slide-in-from-bottom-2 fade-in duration-200"
              >
                <div className="flex items-start gap-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <SourceIcon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground leading-tight">{intent.title}</p>
                    {intent.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{intent.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDismiss(intent)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Dismiss"
                    disabled={isWorking}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {/* Context pills */}
                <div className="flex flex-wrap gap-1">
                  {m.customer_name && (
                    <span className="text-[9px] font-medium bg-muted px-1.5 py-0.5 rounded-full">
                      {m.customer_name}
                    </span>
                  )}
                  {m.job_type && (
                    <span className="text-[9px] font-medium bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded-full">
                      {m.job_type}
                    </span>
                  )}
                  {m.scheduled_date && (
                    <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      {m.scheduled_date} {m.scheduled_time || ""}
                    </span>
                  )}
                </div>

                {isFailed && state.error && (
                  <div className="flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/10 p-1.5 text-[10px] text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span className="break-words">{state.error}</span>
                  </div>
                )}

                {isDone && state.result && (
                  <div className="flex items-center gap-1.5 rounded border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 p-1.5 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-[hsl(var(--success))]" />
                    <span className="text-foreground font-medium">
                      #{state.result.hcp_job_number || state.result.hcp_estimate_number || state.result.hcp_id}
                    </span>
                    <span className="text-muted-foreground">
                      {phase === "syncing" ? "syncing…" : "booked"}
                    </span>
                  </div>
                )}

                {propertyOptions.length > 0 && m.requires_property_selection && (
                  <div className="rounded border border-orange-500/30 bg-orange-500/5 p-2 space-y-1.5">
                    <p className="text-[10px] font-medium text-orange-700">
                      Choose service property
                    </p>
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
                            className="h-auto justify-start gap-1.5 whitespace-normal py-1.5 text-left text-[10px]"
                            onClick={() => setPropertySelections((prev) => ({ ...prev, [intent.id]: property }))}
                            disabled={isWorking || isDone}
                          >
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="min-w-0">
                              <span className="block font-medium">{property.label || "Property"}</span>
                              <span className="block opacity-80">{address}</span>
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full gap-1.5 h-8 text-xs bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]"
                  onClick={() => handleBookIt(intent)}
                  disabled={isWorking || isDone || needsPropertySelection}
                >
                  {isWorking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isDone && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {(phase === "idle" || phase === "failed") && <CalendarPlus className="h-3.5 w-3.5" />}
                  {phase === "resolving" && "Resolving…"}
                  {phase === "booking" && "Booking in HCP…"}
                  {phase === "syncing" && "Syncing…"}
                  {phase === "booked" && "Booked"}
                  {phase === "idle" && (needsPropertySelection ? "Choose Property" : "Book It Now")}
                  {phase === "failed" && "Retry Booking"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Static fallback actions — always visible */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Quick Actions
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-col gap-1 h-auto py-2.5 text-[10px]"
            onClick={() => setShowNewCustomer(true)}
          >
            <UserPlus className="h-4 w-4 text-primary" />
            New Customer
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-col gap-1 h-auto py-2.5 text-[10px]"
            onClick={() => setShowNewJob(true)}
          >
            <Briefcase className="h-4 w-4 text-primary" />
            New Job
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-col gap-1 h-auto py-2.5 text-[10px]"
            onClick={() => {
              if (customerId) {
                window.open(`/customers/${customerId}`, "_blank");
              } else if (phoneNumber) {
                window.open(`/customers?search=${encodeURIComponent(phoneNumber)}`, "_blank");
              }
            }}
          >
            <Search className="h-4 w-4 text-primary" />
            Look Up
          </Button>
        </div>
      </div>

      <NewCustomerDialog
        open={showNewCustomer}
        onOpenChange={setShowNewCustomer}
        onCustomerCreated={() => setShowNewCustomer(false)}
      />
      <NewJobDialog open={showNewJob} onOpenChange={setShowNewJob} />
    </div>
  );
}
