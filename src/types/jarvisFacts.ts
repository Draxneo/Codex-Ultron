/**
 * JarvisFacts — universal 5W (Who/What/When/Where/Why) shape for every JARVIS-emitted card.
 *
 * Populated by JARVIS at card-creation time and rendered identically by <JarvisFactCard />
 * across todos, action_items, outbox approvals, and attention items.
 *
 * All five Ws are optional: cards with missing data simply skip the icon for that field.
 * Adapters in src/lib/jarvisFacts.ts derive this shape from existing rows when the
 * `facts` column is null (legacy fallback).
 */

export type JarvisFactSource = "voicemail" | "sms" | "email" | "call" | "ai_inference" | "rule" | "manual";

export interface JarvisFactWho {
  label: string;                // "James Frye" or "+1 (210) 555-1234"
  customer_id?: string;
  employee_id?: string;
  phone?: string;
}

export interface JarvisFactWhat {
  label: string;                // "Call back about AC", "Approve booking"
  category?: string;            // free-form: "callback" | "booking" | "invoice_reminder" etc.
  job_id?: string;
}

export interface JarvisFactWhen {
  iso?: string;                 // ISO timestamp when known
  label: string;                // "Tomorrow 2pm" or "Within 24h" or "Mar 12"
  relative?: string;            // "in 3h"
}

export interface JarvisFactWhere {
  label: string;                // short — "Home", "Oak St rental", "Church"
  address?: string;             // full street for tooltip / detail
  address_id?: string;          // FK to customer_addresses.id when applicable
}

export interface JarvisFactWhy {
  label: string;                // "Voicemail @ 8:42pm", "Tech requested parts"
  source?: JarvisFactSource;
}

export interface JarvisFacts {
  who?: JarvisFactWho;
  what?: JarvisFactWhat;
  when?: JarvisFactWhen;
  where?: JarvisFactWhere;
  why?: JarvisFactWhy;
}
