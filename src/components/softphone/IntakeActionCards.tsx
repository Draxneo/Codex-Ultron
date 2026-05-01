/**
 * IntakeActionCards - CSR softphone handoff links.
 *
 * The phone popup stays communication-focused: caller context, transcript, and
 * links into Intake/Now. Booking and customer/job creation remain in Intake/Now.
 */

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, ListChecks, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { APP_ACTION_GO_LIVE_ISO } from "@/lib/appLifecycle";

type IntakeNowCard = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  customer_phone: string | null;
  metadata: any;
  created_at: string;
};

interface IntakeActionCardsProps {
  phoneNumber?: string;
  callerName?: string;
  customerId?: string;
  callSid?: string | null;
}

const NOW_CARD_CATEGORIES = [
  "new_appointment",
  "booking_confirm",
  "follow_up",
  "thread_attention",
  "new_lead",
  "missed_call",
  "schedule_change",
  "eta_request",
  "reschedule",
  "confirmation",
  "dispatch_callback",
];

function last10(value?: string | null) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function cardPhone(card: IntakeNowCard) {
  const metadata = card.metadata || {};
  return card.customer_phone || metadata.phone || metadata.customer_phone || metadata.callback_phone || null;
}

function buildIntakeUrl(phoneNumber?: string) {
  return phoneNumber ? `/intake?phone=${encodeURIComponent(phoneNumber)}` : "/intake";
}

function isCurrentActionItem(row: any) {
  const createdAt = Date.parse(row?.created_at || "");
  const cutoff = Date.parse(APP_ACTION_GO_LIVE_ISO);
  return Number.isFinite(createdAt) && createdAt >= cutoff;
}

export function IntakeActionCards({ phoneNumber, callerName, customerId, callSid }: IntakeActionCardsProps) {
  const [cards, setCards] = useState<IntakeNowCard[]>([]);
  const [savingNowCard, setSavingNowCard] = useState(false);
  const queryClient = useQueryClient();
  const normalizedPhone = useMemo(() => last10(phoneNumber), [phoneNumber]);
  const intakeUrl = buildIntakeUrl(phoneNumber);
  const primaryCard = cards[0];

  useEffect(() => {
    if (!normalizedPhone || normalizedPhone.length < 10) {
      setCards([]);
      return;
    }

    const loadCards = async () => {
      const { data, error } = await supabase
        .from("action_items" as any)
        .select("*")
        .eq("status", "pending")
        .in("category", NOW_CARD_CATEGORIES)
        .gte("created_at", APP_ACTION_GO_LIVE_ISO)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[IntakeActionCards] Could not load Now cards", error);
        return;
      }

      const matched = ((data || []) as any[]).filter((row) => last10(cardPhone(row)) === normalizedPhone);
      setCards(matched.slice(0, 3).map(mapRow));
    };

    loadCards();
  }, [normalizedPhone]);

  useEffect(() => {
    if (!normalizedPhone || normalizedPhone.length < 10) return;

    const channel = supabase
      .channel(`csr-now-cards-${normalizedPhone}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_items" },
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            const id = payload.old?.id;
            if (id) setCards((prev) => prev.filter((card) => card.id !== id));
            return;
          }

          const row = payload.new;
          const matchesPhone = last10(cardPhone(row)) === normalizedPhone;
          const isOpenNowCard = isCurrentActionItem(row) && row?.status === "pending" && NOW_CARD_CATEGORIES.includes(row.category);
          if (!matchesPhone || !isOpenNowCard) {
            setCards((prev) => prev.filter((card) => card.id !== row?.id));
            return;
          }

          setCards((prev) => {
            const mapped = mapRow(row);
            const next = prev.some((card) => card.id === mapped.id)
              ? prev.map((card) => (card.id === mapped.id ? mapped : card))
              : [mapped, ...prev];
            return next
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 3);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [normalizedPhone]);

  const createOrUpdateNowCard = async () => {
    if (!phoneNumber) {
      toast.error("No caller phone number yet.");
      return;
    }

    setSavingNowCard(true);
    const now = new Date().toISOString();
    const description = callerName
      ? `${callerName} is on the phone. Review Intake context before approving the next action.`
      : "Caller is on the phone. Review Intake context before approving the next action.";

    try {
      if (primaryCard) {
        const previousMeta = primaryCard.metadata || {};
        const previousUpdates = Array.isArray(previousMeta.context_updates) ? previousMeta.context_updates : [];
        const { error } = await supabase
          .from("action_items" as any)
          .update({
            description: primaryCard.description || description,
            customer_phone: primaryCard.customer_phone || phoneNumber,
            suggested_action: "Open Intake HQ, review the live call context, then approve or update the next action from Now HQ.",
            metadata: {
              ...previousMeta,
              phone: previousMeta.phone || phoneNumber,
              customer_phone: previousMeta.customer_phone || phoneNumber,
              customer_name: previousMeta.customer_name || callerName || null,
              customer_id: previousMeta.customer_id || customerId || null,
              call_sid: previousMeta.call_sid || callSid || null,
              source_url: previousMeta.source_url || intakeUrl,
              living_card: true,
              last_context_update_at: now,
              updated_from: "csr_softphone",
              context_updates: [
                {
                  at: now,
                  source: "csr_softphone",
                  category: primaryCard.category,
                  summary: "CSR requested a Now card refresh from the phone popup.",
                },
                ...previousUpdates,
              ].slice(0, 12),
            },
          })
          .eq("id", primaryCard.id);
        if (error) throw error;
        toast.success("Now card updated");
      } else {
        const { data, error } = await supabase
          .from("action_items" as any)
          .insert({
            source: "csr_softphone",
            category: "thread_attention",
            priority: "normal",
            title: callerName ? `Review live call with ${callerName}` : "Review live caller",
            description,
            suggested_action: "Open Intake HQ, review the live call context, then approve or update the next action from Now HQ.",
            customer_phone: phoneNumber,
            metadata: {
              phone: phoneNumber,
              customer_phone: phoneNumber,
              customer_name: callerName || null,
              customer_id: customerId || null,
              call_sid: callSid || null,
              source_url: intakeUrl,
              living_card: true,
              context_updates: [
                {
                  at: now,
                  source: "csr_softphone",
                  category: "thread_attention",
                  summary: "CSR created a Now card from the phone popup.",
                },
              ],
            },
          })
          .select("*")
          .single();
        if (error) throw error;
        if (data) setCards((prev) => [mapRow(data), ...prev].slice(0, 3));
        toast.success("Now card created");
      }

      queryClient.invalidateQueries({ queryKey: ["now-hq-action-items"] });
      queryClient.invalidateQueries({ queryKey: ["action_items_pending"] });
      queryClient.invalidateQueries({ queryKey: ["hud_attention_counts"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not create/update Now card");
    } finally {
      setSavingNowCard(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="rounded-lg border bg-card p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Send to Intake or Now
        </p>
        {primaryCard ? (
          <div className="mt-2 rounded-md border bg-muted/30 p-2">
            <p className="line-clamp-1 text-xs font-semibold">{primaryCard.title}</p>
            {primaryCard.description && (
              <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{primaryCard.description}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No follow-up card is open for this caller yet.
          </p>
        )}

        <div className="mt-3 grid gap-1.5">
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <a href={intakeUrl} target="_blank" rel="noreferrer">
              <MessageSquare className="h-3.5 w-3.5" />
              Open Intake
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={createOrUpdateNowCard}
            disabled={savingNowCard || !phoneNumber}
          >
            {savingNowCard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
            {primaryCard ? "Update Follow-Up" : "Create Follow-Up"}
          </Button>
          {primaryCard && (
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <a href="/now" target="_blank" rel="noreferrer">
                <ArrowRight className="h-3.5 w-3.5" />
                Open Now HQ
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function mapRow(row: any): IntakeNowCard {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    customer_phone: row.customer_phone,
    metadata: row.metadata,
    created_at: row.created_at,
  };
}
