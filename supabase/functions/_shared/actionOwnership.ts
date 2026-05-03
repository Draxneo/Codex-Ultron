export type ActionOwnerType = "person" | "office_queue";

const OFFICE_QUEUE_LABELS: Record<string, string> = {
  dispatch: "Dispatch queue",
  paperwork: "Office paperwork",
  closeout: "Closeout queue",
  billing: "Billing queue",
  customer_follow_up: "Customer follow-up",
};

function textBlob(input: {
  category?: string | null;
  title?: string | null;
  description?: string | null;
  suggested_action?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const meta = input.metadata || {};
  return [
    input.category,
    input.title,
    input.description,
    input.suggested_action,
    meta.jarvis_intent,
    meta.workflow_type,
    meta.job_type,
    meta.quote_subject,
    meta.description,
    meta.inbound_message,
    meta.thread_snippet,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function withActionOwnership(input: {
  category: string;
  title: string;
  description?: string | null;
  suggested_action?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const metadata = input.metadata || {};
  if (metadata.owner_type || metadata.ownerType) return metadata;

  const text = textBlob(input);
  const requiresSchedule =
    input.category === "new_appointment" ||
    metadata.needs_schedule_before_accept === true ||
    Boolean(metadata.follow_up_date || metadata.scheduled_date) ||
    /\b(quote|bid|estimate|follow[-\s]?up|callback|call back|appointment|book|schedule)\b/.test(text);

  if (requiresSchedule) {
    return {
      ...metadata,
      owner_type: "person" as ActionOwnerType,
      owner_label: String(metadata.assigned_to || "Pick a person"),
      owner_required: true,
      needs_schedule_before_accept: true,
    };
  }

  let ownerQueue = "dispatch";
  if (/\b(cps|rebate|warranty|registered|registration|permit|inspection|paperwork|certificate)\b/.test(text)) {
    ownerQueue = "closeout";
  } else if (/\b(invoice|payment|billing|receipt|paid|balance|stripe)\b/.test(text)) {
    ownerQueue = "billing";
  } else if (/\b(reply|text|call|question|follow)\b/.test(text)) {
    ownerQueue = "customer_follow_up";
  }

  return {
    ...metadata,
    owner_type: "office_queue" as ActionOwnerType,
    owner_queue: ownerQueue,
    owner_label: OFFICE_QUEUE_LABELS[ownerQueue] || "Office queue",
    owner_required: true,
  };
}

