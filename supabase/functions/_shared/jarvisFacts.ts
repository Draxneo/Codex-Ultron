/**
 * Edge-function helper for building the unified 5W facts payload.
 *
 * Used by every edge function that creates a JARVIS card (action_items,
 * outbound_drafts) so the dispatcher UI can render them through one component.
 *
 * See src/types/jarvisFacts.ts for the canonical TypeScript shape.
 */

export type JarvisFactSource = "voicemail" | "sms" | "email" | "call" | "ai_inference" | "rule" | "manual";

export interface JarvisFacts {
  who?:   { label: string; customer_id?: string; employee_id?: string; phone?: string };
  what?:  { label: string; category?: string; job_id?: string };
  when?:  { iso?: string; label: string; relative?: string };
  where?: { label: string; address?: string; address_id?: string };
  why?:   { label: string; source?: JarvisFactSource };
}

interface BuildFactsInput {
  customer?: { id?: string; first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  employee?: { id?: string; name?: string | null } | null;
  phone?: string | null;
  job?:    { id?: string | null; address?: string | null; address_id?: string | null } | null;
  what?:   { label: string; category?: string };
  whenIso?: string | null;
  whenLabel?: string | null;
  where?:  { label?: string; address?: string; address_id?: string } | null;
  why?:    { label: string; source?: JarvisFactSource } | null;
}

function fmtName(c: { first_name?: string | null; last_name?: string | null }): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

function fmtPhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const h = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const past = diff < 0;
  if (m < 60) return past ? `${m}m ago` : `in ${m}m`;
  if (h < 24) return past ? `${h}h ago` : `in ${h}h`;
  return past ? `${days}d ago` : `in ${days}d`;
}

export function buildFacts(input: BuildFactsInput): JarvisFacts {
  const out: JarvisFacts = {};

  // WHO
  if (input.customer) {
    const name = fmtName(input.customer);
    if (name) {
      out.who = { label: name, customer_id: input.customer.id, phone: input.customer.phone || input.phone || undefined };
    } else if (input.customer.phone || input.phone) {
      out.who = { label: fmtPhone(input.customer.phone || input.phone || ""), customer_id: input.customer.id, phone: input.customer.phone || input.phone || undefined };
    }
  } else if (input.employee?.name) {
    out.who = { label: input.employee.name, employee_id: input.employee.id };
  } else if (input.phone) {
    out.who = { label: fmtPhone(input.phone), phone: input.phone };
  }

  // WHAT
  if (input.what?.label) {
    out.what = { label: input.what.label, category: input.what.category, job_id: input.job?.id ?? undefined };
  }

  // WHEN
  if (input.whenIso) {
    out.when = { iso: input.whenIso, label: input.whenLabel || relTime(input.whenIso), relative: relTime(input.whenIso) };
  } else if (input.whenLabel) {
    out.when = { label: input.whenLabel };
  }

  // WHERE
  const wAddr = input.where?.address ?? input.job?.address ?? null;
  const wId = input.where?.address_id ?? input.job?.address_id ?? null;
  if (wAddr || input.where?.label) {
    out.where = {
      label: input.where?.label || "Service address",
      address: wAddr || undefined,
      address_id: wId || undefined,
    };
  }

  // WHY
  if (input.why?.label) {
    out.why = { label: input.why.label, source: input.why.source };
  }

  return out;
}
