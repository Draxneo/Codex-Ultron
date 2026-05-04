/**
 * Adapters: convert legacy rows (action_items, outbound_drafts, attention items)
 * into the unified JarvisFacts shape consumed by <JarvisFactCard />.
 *
 * Rule: prefer row.facts when present; fall back to legacy columns otherwise.
 * Cards with missing fields simply omit those icons in the renderer.
 */

import { format, formatDistanceToNow } from "date-fns";
import { formatPhone } from "@/lib/formatters";
import type { JarvisFacts } from "@/types/jarvisFacts";

function isJarvisFacts(value: unknown): value is JarvisFacts {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toWhenLabel(iso?: string | null, dateOnly?: string | null): { iso?: string; label: string } | undefined {
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return { iso, label: format(d, "MMM d, h:mma").replace(":00", "") };
    }
  }
  if (dateOnly) {
    const d = new Date(dateOnly + "T00:00:00");
    if (!isNaN(d.getTime())) {
      return { iso: d.toISOString(), label: format(d, "MMM d") };
    }
  }
  return undefined;
}

// ─────────────── ActionItem adapter ───────────────
export function actionItemToFacts(item: any): JarvisFacts {
  if (isJarvisFacts(item?.facts) && Object.keys(item.facts).length > 0) {
    return item.facts as JarvisFacts;
  }

  const facts: JarvisFacts = {};
  const meta = item?.metadata || {};

  // WHO
  if (meta.customer_name) {
    facts.who = { label: meta.customer_name, customer_id: meta.customer_id, phone: item.customer_phone || meta.phone };
  } else if (item.customer_phone) {
    facts.who = { label: formatPhone(item.customer_phone), phone: item.customer_phone };
  }

  // WHAT
  facts.what = { label: item.title || item.suggested_action || "Action", category: item.category, job_id: item.job_id ?? undefined };

  // WHEN
  const when = toWhenLabel(meta.scheduled_iso || meta.preferred_date, meta.scheduled_date);
  if (when) facts.when = when;

  // WHERE
  if (meta.address) {
    facts.where = { label: meta.address_label || "Address", address: String(meta.address) };
  }

  // WHY — description or source category
  if (item.description) {
    facts.why = { label: item.description.slice(0, 80), source: item.source as any };
  } else if (item.source) {
    facts.why = { label: item.source, source: item.source as any };
  }

  return facts;
}

// ─────────────── Outbox draft adapter ───────────────
export function outboxToFacts(draft: any): JarvisFacts {
  const meta = draft?.metadata || {};
  if (isJarvisFacts(meta.facts) && Object.keys(meta.facts).length > 0) {
    return meta.facts as JarvisFacts;
  }

  const facts: JarvisFacts = {};

  // WHO — recipient
  if (draft?.recipient) {
    facts.who = {
      label: meta.customer_name || (draft.recipient.includes("@") ? draft.recipient : formatPhone(draft.recipient)),
      customer_id: meta.customer_id,
      phone: draft.channel === "sms" ? draft.recipient : undefined,
    };
  }

  // WHAT
  facts.what = {
    label: draft?.subject || (draft?.channel === "sms" ? "Send SMS" : "Send email"),
    category: meta.booking_intent ? "booking" : draft?.channel,
    job_id: draft?.job_id ?? undefined,
  };

  // WHEN — booking intent date if present
  const when = toWhenLabel(meta?.booking_intent?.preferred_iso, meta?.booking_intent?.preferred_date);
  if (when) facts.when = when;

  // WHERE
  if (meta?.booking_intent?.address) {
    facts.where = { label: "Service address", address: String(meta.booking_intent.address) };
  }

  // WHY
  if (draft?.source) {
    facts.why = { label: `Drafted by ${draft.source}`, source: "ai_inference" };
  }

  // Relative time of draft creation when nothing else
  if (!facts.when && draft?.created_at) {
    const d = new Date(draft.created_at);
    if (!isNaN(d.getTime())) {
      facts.when = { iso: d.toISOString(), label: formatDistanceToNow(d, { addSuffix: true }), relative: formatDistanceToNow(d, { addSuffix: true }) };
    }
  }

  return facts;
}
