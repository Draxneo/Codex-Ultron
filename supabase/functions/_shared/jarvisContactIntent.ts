export type JarvisContactIntent =
  | "new_service_booking"
  | "new_estimate_request"
  | "maintenance_request"
  | "reschedule_existing_work"
  | "cancel_existing_work"
  | "eta_request"
  | "access_instructions"
  | "pet_warning"
  | "callback_number_update"
  | "confirm_existing_work"
  | "customer_info_update"
  | "billing_question"
  | "warranty_or_membership_question"
  | "quote_follow_up"
  | "complaint"
  | "general_question"
  | "unknown";

export type JarvisIntentConfidence = "high" | "medium" | "low";

export type JarvisIntentResult = {
  intent: JarvisContactIntent;
  confidence: JarvisIntentConfidence;
  summary: string;
  shouldCreateNewWork: boolean;
  shouldAttachToExistingWork: boolean;
  actionCategory: string;
  suggestedAction: string;
  extractedFields: Record<string, unknown>;
  reason: string;
};

export type JarvisActiveWorkContext = {
  activeJob: any | null;
  activeEstimate: any | null;
  pendingBooking: any | null;
};

type ClassifyArgs = {
  text: string;
  extracted?: Record<string, any> | null;
  activeWork?: JarvisActiveWorkContext | null;
  channel: "sms" | "call";
};

type LookupArgs = {
  customerId?: string | null;
  phone?: string | null;
  pendingWindowHours?: number;
};

const ACTIVE_JOB_DONE_STATUSES = ["done", "invoiced", "canceled", "cancelled", "completed"];
const ACTIVE_ESTIMATE_DONE_STATUSES = ["lost", "canceled", "cancelled", "done", "won", "converted"];

function postgrestIn(values: string[]): string {
  return `(${values.map((value) => `"${value}"`).join(",")})`;
}

export function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    const s = String(value || "").trim();
    if (s) return s;
  }
  return null;
}

export function describeActiveWork(activeWork?: JarvisActiveWorkContext | null): string | null {
  if (!activeWork) return null;
  if (activeWork.activeJob) {
    const job = activeWork.activeJob;
    const ref = job.hcp_job_number ? `job #${job.hcp_job_number}` : "the active job";
    const date = job.scheduled_date ? ` scheduled ${job.scheduled_date}` : "";
    return `${ref}${date}`.trim();
  }
  if (activeWork.activeEstimate) {
    const estimate = activeWork.activeEstimate;
    const ref = estimate.estimate_number ? `estimate #${estimate.estimate_number}` : "the upcoming estimate";
    const date = estimate.scheduled_date ? ` scheduled ${estimate.scheduled_date}` : "";
    return `${ref}${date}`.trim();
  }
  if (activeWork.pendingBooking) return "the pending booking card";
  return null;
}

export function classifyCustomerContactIntent(args: ClassifyArgs): JarvisIntentResult {
  const extracted = args.extracted || {};
  const rawText = [
    args.text,
    extracted.summary,
    extracted.problem_description,
    extracted.suggested_action,
    extracted.scheduling_preference,
  ].filter(Boolean).join(" ");
  const text = rawText.toLowerCase();
  const activeWork = args.activeWork || null;
  const hasActiveWork = !!(activeWork?.activeJob || activeWork?.activeEstimate || activeWork?.pendingBooking);
  const workRef = describeActiveWork(activeWork) || "existing work";

  const explicitSeparateWork = includesAny(text, [
    /\bnew\b.*\b(job|appointment|visit|issue|system|unit)\b/,
    /\bseparate\b.*\b(job|appointment|visit|issue)\b/,
    /\banother\b.*\b(job|appointment|visit|issue|unit|system)\b/,
    /\bdifferent\b.*\b(property|address|house|unit|system)\b/,
  ]);

  const hasAccess = !!extracted.lockbox_code || includesAny(text, [
    /\b(gate|door|lockbox|garage|entry|access)\s*(code|instructions?)\b/,
    /\bcode\s*(is|:)?\s*[a-z0-9#*-]{3,}\b/,
    /\bkey\s+(is\s+)?(under|inside|with)\b/,
  ]);
  const hasPetWarning = !!extracted.pet_warning || includesAny(text, [
    /\b(dog|dogs|cat|cats|pet|pets)\b/,
    /\bput (him|her|them|the dogs?) (up|away)\b/,
    /\bbackyard\b.*\b(dog|dogs|pet|pets)\b/,
  ]);
  const hasCallbackUpdate = !!extracted.callback_phone || !!extracted.phone || includesAny(text, [
    /\b(call|text)\s+(me|us|him|her|my wife|my husband|my spouse)\s+(at|on)\b/,
    /\bdifferent\s+(number|phone)\b/,
    /\buse\s+this\s+(number|phone)\b/,
    /\bmy\s+(wife|husband|spouse|son|daughter)\b.*\b(number|phone)\b/,
  ]);
  const hasEtaRequest = includesAny(text, [
    /\beta\b/,
    /\b(on the way|heads up|30 minute|thirty minute)\b/,
    /\bwhen\s+(will|is|are|can).*\b(arriv|come|show)\b/,
    /\bwhat\s+time\b.*\b(arriv|come|show)\b/,
  ]);
  const hasReschedule = extracted.intent === "reschedule" || includesAny(text, [
    /\breschedul/,
    /\bmove\b.*\b(appointment|visit|job|time|day)\b/,
    /\bchange\b.*\b(appointment|visit|job|time|day)\b/,
    /\b(can'?t|cannot|won'?t)\s+(make|do)\b/,
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(instead|work better)\b/,
  ]);
  const hasCancel = extracted.intent === "cancel" || includesAny(text, [
    /\bcancel\b/,
    /\bdon'?t\s+(come|send|need)\b/,
    /\bno\s+longer\s+need\b/,
    /\bwe'?re\s+good\b/,
  ]);
  const hasConfirm = extracted.intent === "confirmation" || includesAny(text, [
    /\b(confirm|confirmed|yes that works|sounds good|see you then)\b/,
  ]);
  const hasBilling = includesAny(text, [
    /\b(invoice|payment|paid|pay|card|receipt|balance|bill|billing)\b/,
  ]);
  const hasWarranty = includesAny(text, [
    /\b(warranty|labor warranty|parts warranty|comfort club|membership|maintenance plan|service agreement)\b/,
  ]);
  const hasQuoteFollowUp = includesAny(text, [
    /\b(quote|estimate|proposal|option|financing|approved|approve|decline)\b/,
  ]);
  const hasComplaint = extracted.intent === "complaint" || includesAny(text, [
    /\b(complaint|upset|angry|not happy|still not working|never fixed|bad service)\b/,
  ]);
  const hasMaintenance = extracted.service_type === "maintenance" || includesAny(text, [
    /\b(maintenance|tune\s*-?\s*up|comfort club|spring check|fall check)\b/,
  ]);
  const hasEstimateRequest = extracted.service_type === "estimate" || extracted.service_type === "install" || includesAny(text, [
    /\b(estimate|quote|replace|replacement|new system|new unit|install|installation)\b/,
  ]);
  const hasBooking = extracted.intent === "booking" || includesAny(text, [
    /\b(schedule|book|appointment|come out|send someone|need someone|service call)\b/,
    /\b(ac|a\/c|air conditioner|heater|heat pump|furnace)\b.*\b(broken|not working|not cooling|not heating|leaking|making noise)\b/,
  ]);
  const isInfoReply = extracted.intent === "info_reply" || includesAny(text, [
    /\b(my name is|address is|email is|phone number is)\b/,
  ]);

  const fields: Record<string, unknown> = {
    callback_phone: firstNonEmpty(extracted.callback_phone, extracted.phone),
    access_code: firstNonEmpty(extracted.access_code, extracted.lockbox_code),
    access_notes: firstNonEmpty(extracted.access_notes),
    pet_warning: firstNonEmpty(extracted.pet_warning),
    requested_eta: firstNonEmpty(extracted.requested_eta),
    requested_schedule_change: firstNonEmpty(extracted.requested_schedule_change, extracted.scheduling_preference),
    cancel_reason: firstNonEmpty(extracted.cancel_reason),
    target_job_id: activeWork?.activeJob?.id || null,
    target_estimate_id: activeWork?.activeEstimate?.id || null,
  };

  const specific = (intent: JarvisContactIntent, actionCategory: string, suggestedAction: string, reason: string): JarvisIntentResult => ({
    intent,
    confidence: hasActiveWork || intent.startsWith("new_") ? "high" : "medium",
    summary: firstNonEmpty(extracted.summary, extracted.problem_description, args.text.slice(0, 180)) || "",
    shouldCreateNewWork: intent === "new_service_booking" || intent === "new_estimate_request" || intent === "maintenance_request",
    shouldAttachToExistingWork: hasActiveWork && !explicitSeparateWork,
    actionCategory,
    suggestedAction,
    extractedFields: fields,
    reason,
  });

  if (hasReschedule) return specific("reschedule_existing_work", "schedule_change", `Review ${workRef} and offer a new arrival window`, "Customer is trying to move an existing appointment.");
  if (hasCancel) return specific("cancel_existing_work", "schedule_change", `Review ${workRef} before canceling anything`, "Customer may be canceling existing work.");
  if (hasEtaRequest) return specific("eta_request", "eta_request", `Check dispatch board and send an ETA update for ${workRef}`, "Customer is asking when someone will arrive.");
  if (hasAccess) return specific("access_instructions", "access_note", `Attach access instructions to ${workRef}`, "Customer provided gate, lockbox, door, or entry instructions.");
  if (hasPetWarning) return specific("pet_warning", "pet_warning", `Add pet/access warning to ${workRef}`, "Customer warned us about pets or site access.");
  if (hasCallbackUpdate) return specific("callback_number_update", "contact_update", `Save the callback preference and tell the tech which number to use`, "Customer provided a different callback or text number.");
  if (hasConfirm) return specific("confirm_existing_work", "confirmation", `Mark ${workRef} as confirmed`, "Customer confirmed an existing appointment.");
  if (hasBilling) return specific("billing_question", "thread_attention", "Review billing/payment context and reply", "Customer is asking about billing or payment.");
  if (hasWarranty) return specific("warranty_or_membership_question", "thread_attention", "Review warranty or Comfort Club status and reply", "Customer is asking about warranty or membership.");
  if (hasQuoteFollowUp && hasActiveWork && !explicitSeparateWork) {
    return specific("quote_follow_up", "follow_up", `Review ${workRef} and follow up on quote/proposal`, "Customer is discussing an existing estimate or proposal.");
  }
  if (hasComplaint) return specific("complaint", "thread_attention", `Review ${workRef} and escalate if needed`, "Customer appears unhappy or the issue may still be unresolved.");
  if (hasActiveWork && !explicitSeparateWork && (hasBooking || isInfoReply || text.length > 0)) {
    return specific("customer_info_update", "follow_up", `Attach this update to ${workRef}`, "Customer has active work, so defaulting to update instead of new booking.");
  }
  if (hasEstimateRequest) return specific("new_estimate_request", "new_appointment", "Prepare a replacement estimate booking card", "Customer appears to want a quote or replacement estimate.");
  if (hasMaintenance) return specific("maintenance_request", "new_appointment", "Prepare a maintenance visit booking card", "Customer appears to want maintenance.");
  if (hasBooking) return specific("new_service_booking", "new_appointment", "Prepare a service booking card", "Customer appears to want a new service visit.");
  if (isInfoReply) return specific("customer_info_update", "thread_attention", "Update the customer record or existing pending card", "Customer provided contact details.");

  return {
    intent: "general_question",
    confidence: text.length > 10 ? "medium" : "low",
    summary: firstNonEmpty(extracted.summary, extracted.problem_description, args.text.slice(0, 180)) || "",
    shouldCreateNewWork: false,
    shouldAttachToExistingWork: hasActiveWork,
    actionCategory: hasActiveWork ? "thread_attention" : "new_lead",
    suggestedAction: hasActiveWork ? `Review ${workRef} and reply` : "Review and decide whether this is a new lead",
    extractedFields: fields,
    reason: hasActiveWork ? "General message from a customer with active work." : "General message without active work context.",
  };
}

export async function lookupActiveWorkContext(supabase: any, args: LookupArgs): Promise<JarvisActiveWorkContext> {
  const phoneDigits = normalizePhoneDigits(args.phone);
  let activeJob: any = null;
  let activeEstimate: any = null;
  let pendingBooking: any = null;

  if (args.customerId) {
    const { data: openJob } = await supabase
      .from("jobs")
      .select("id, hcp_job_number, customer_id, customer_name, customer_phone, job_type, status, scheduled_date, scheduled_time, address")
      .eq("customer_id", args.customerId)
      .not("status", "in", postgrestIn(ACTIVE_JOB_DONE_STATUSES))
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    activeJob = openJob || null;

    const { data: openEstimate } = await supabase
      .from("estimates")
      .select("id, estimate_number, customer_id, customer_name, customer_phone, status, work_status, scheduled_date, address")
      .eq("customer_id", args.customerId)
      .not("status", "in", postgrestIn(ACTIVE_ESTIMATE_DONE_STATUSES))
      .not("work_status", "in", "(won,lost)")
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    activeEstimate = openEstimate || null;
  }

  if (!activeJob && phoneDigits.length === 10) {
    const { data: jobByPhone } = await supabase
      .rpc("find_job_by_phone", { digits: phoneDigits })
      .maybeSingle();
    activeJob = jobByPhone || null;
  }

  if (!activeEstimate && phoneDigits.length === 10) {
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id, estimate_number, customer_id, customer_name, customer_phone, status, work_status, scheduled_date, address")
      .not("customer_phone", "is", null)
      .not("status", "in", postgrestIn(ACTIVE_ESTIMATE_DONE_STATUSES))
      .not("work_status", "in", "(won,lost)")
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .limit(80);
    activeEstimate = (estimates || []).find((e: any) => normalizePhoneDigits(e.customer_phone) === phoneDigits) || null;
  }

  if (phoneDigits.length === 10) {
    const since = new Date(Date.now() - (args.pendingWindowHours || 2) * 60 * 60 * 1000).toISOString();
    const { data: cards } = await supabase
      .from("action_items")
      .select("id, title, category, status, customer_phone, metadata, created_at")
      .eq("category", "new_appointment")
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);
    pendingBooking = (cards || []).find((card: any) => normalizePhoneDigits(card.customer_phone || card.metadata?.phone) === phoneDigits) || null;
  }

  return { activeJob, activeEstimate, pendingBooking };
}

export function buildJarvisIntentMetadata(intent: JarvisIntentResult, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    jarvis_intent: intent.intent,
    jarvis_intent_confidence: intent.confidence,
    jarvis_intent_reason: intent.reason,
    should_create_new_work: intent.shouldCreateNewWork,
    should_attach_to_existing_work: intent.shouldAttachToExistingWork,
    extracted_intent_fields: intent.extractedFields,
  };
}
