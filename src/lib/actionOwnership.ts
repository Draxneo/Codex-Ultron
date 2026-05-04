export type ActionOwnerType = "person" | "office_queue";

export type ActionOwnership = {
  ownerType: ActionOwnerType;
  ownerLabel: string;
  ownerQueue: string | null;
  requiresSchedule: boolean;
};

const OFFICE_QUEUE_LABELS: Record<string, string> = {
  dispatch: "Dispatch queue",
  paperwork: "Office paperwork",
  closeout: "Closeout queue",
  billing: "Billing queue",
  customer_follow_up: "Customer follow-up",
};

function textBlob(item: {
  category?: string | null;
  title?: string | null;
  description?: string | null;
  suggested_action?: string | null;
  metadata?: Record<string, any> | null;
}) {
  const meta = item.metadata || {};
  return [
    item.category,
    item.title,
    item.description,
    item.suggested_action,
    meta.jarvis_intent,
    meta.workflow_type,
    meta.job_type,
    meta.quote_subject,
    meta.description,
    meta.inbound_message,
    meta.thread_snippet,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function getActionOwnership(item: {
  category?: string | null;
  title?: string | null;
  description?: string | null;
  suggested_action?: string | null;
  metadata?: Record<string, any> | null;
}): ActionOwnership {
  const meta = item.metadata || {};
  const explicitOwnerType = meta.owner_type || meta.ownerType;
  const explicitQueue = meta.owner_queue || meta.ownerQueue || null;
  if (explicitOwnerType === "person") {
    return {
      ownerType: "person",
      ownerLabel: meta.owner_label || meta.ownerLabel || meta.assigned_to || "Assigned person",
      ownerQueue: null,
      requiresSchedule: meta.needs_schedule_before_accept === true || meta.requires_schedule_before_accept === true,
    };
  }
  if (explicitOwnerType === "office_queue") {
    const queue = String(explicitQueue || "dispatch");
    return {
      ownerType: "office_queue",
      ownerLabel: meta.owner_label || meta.ownerLabel || OFFICE_QUEUE_LABELS[queue] || "Office queue",
      ownerQueue: queue,
      requiresSchedule: false,
    };
  }

  const text = textBlob(item);
  const requiresSchedule =
    item.category === "new_appointment" ||
    meta.needs_schedule_before_accept === true ||
    meta.follow_up_date ||
    meta.scheduled_date ||
    /\b(quote|bid|estimate|follow[-\s]?up|callback|call back|appointment|book|schedule)\b/.test(text);

  if (requiresSchedule) {
    return {
      ownerType: "person",
      ownerLabel: meta.assigned_to || "Pick a person",
      ownerQueue: null,
      requiresSchedule: true,
    };
  }

  let queue = "dispatch";
  if (/\b(cps|rebate|warranty|registered|registration|permit|inspection|paperwork|certificate)\b/.test(text)) {
    queue = "closeout";
  } else if (/\b(invoice|payment|billing|receipt|paid|balance|stripe)\b/.test(text)) {
    queue = "billing";
  } else if (/\b(reply|text|call|question|follow)\b/.test(text)) {
    queue = "customer_follow_up";
  }

  return {
    ownerType: "office_queue",
    ownerLabel: OFFICE_QUEUE_LABELS[queue] || "Office queue",
    ownerQueue: queue,
    requiresSchedule: false,
  };
}

