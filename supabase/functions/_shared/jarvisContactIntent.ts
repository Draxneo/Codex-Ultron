export type JarvisContactIntent =
  | "new_service_booking"
  | "new_estimate_request"
  | "maintenance_request"
  | "quote_request"
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
    extracted.call_intent,
    extracted.follow_up_due,
    extracted.quote_subject,
    extracted.quote_options_requested,
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
    /\b(lockbox|keypad)\b.*\b\d{3,}\b/,
    /\b(side door|front door|garage entry|drive around back|come through)\b/,
    /\bcode\s*(is|:)?\s*[a-z0-9#*-]{3,}\b/,
    /\bkey\s+(is\s+)?(under|inside|with)\b/,
  ]);
  const hasPetWarning = !!extracted.pet_warning || includesAny(text, [
    /\b(dog|dogs|cat|cats|pet|pets|puppy|shepherd|goat|goats|livestock)\b/,
    /\bput (him|her|them|the dogs?) (up|away)\b/,
    /\bbackyard\b.*\b(dog|dogs|pet|pets)\b/,
  ]);
  const hasCallbackUpdate = !!extracted.callback_phone || (hasActiveWork && !!extracted.phone) || includesAny(text, [
    /\b(call|text)\s+(me|us|him|her|my wife|my husband|my spouse)\s+(at|on)\b/,
    /\b(call|text)\s+(my wife|my husband|my spouse|my son|my daughter|my dad|the tenant|the office manager)\b/,
    /\b(my wife|my husband|my spouse|my son|my daughter|my dad|the tenant|the office manager)\b.*\bcall\s+(her|him|them)\s+first\b/,
    /\b(have|tell|ask)\s+(jonathan|clint|the\s+tech|the\s+technician|the\s+installer|installer|tech|technician)\s+(call|text)\b/,
    /\b(have|tell|ask)\s+(jonathan|clint|the\s+tech|the\s+technician|the\s+installer|installer|tech|technician)\s+to\s+(call|text)\b/,
    /\b(tell|ask)\s+(the\s+)?(tech|technician|installer|jonathan|clint)\s+to\s+(call|text)\b/,
    /\b(best\s+callback\s+number|number changed|use\s+\d{3}|use\s+this\s+phone|all updates today)\b/,
    /\bdon'?t\s+call\b.*\bcall\s+this\b/,
    /\bdifferent\s+(number|phone)\b/,
    /\buse\s+this\s+(number|phone)\b/,
    /\bmy\s+(wife|husband|spouse|son|daughter)\b.*\b(number|phone)\b/,
  ]);
  const hasEtaRequest = includesAny(text, [
    /\beta\b/,
    /\b(on the way|heads up|30 minute|thirty minute)\b/,
    /\bwhen\s+(will|is|are|can).*\b(arriv\w*|come|coming|show\w*)\b/,
    /\bwhen\b.*\b(will|is|are|can)\b.*\bbe\s+here\b/,
    /\b(still|already)\s+(coming|headed|on\s+the\s+way)\b/,
    /\b(is|are)\s+.*\bcoming\s+between\b/,
    /\bwhat\s+time\b.*\b(arriv\w*|come|coming|show\w*)\b/,
    /\bwhat\s+time\b.*\b(expect|showing up)\b/,
    /\barrival\s+time\b/,
    /\brunning\s+behind\b/,
    /\b(close|close\?)\b/,
    /\b(on|scheduled)\s+for\s+\d{1,2}\s*(to|-)\s*\d{1,2}\b/,
    /\bstay\s+home\b.*\b(afternoon|morning|today)\b/,
  ]);
  const hasReschedule = extracted.intent === "reschedule" || extracted.call_intent === "reschedule_existing" || includesAny(text, [
    /\breschedul/,
    /\b(push|slide|bump)\b.*\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|appointment|visit|job|time|day|next week|date|back|15th)\b/,
    /\bmove\b.*\b(appointment|visit|job|time|day)\b/,
    /\bchange\b.*\b(appointment|visit|job|time|day)\b/,
    /\bpick\s+another\s+day\b/,
    /\bwork\s+better\b/,
    /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(morning|afternoon|evening)?\s*works\s+better\b/,
    /\bneed\s+a\s+later\s+appointment\b/,
    /\b(can'?t|cannot|won'?t)\s+(make|do)\b/,
    /\bwon'?t\s+be\s+home\b/,
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(instead|work better)\b/,
  ]);
  const hasCancel = extracted.intent === "cancel" || extracted.call_intent === "cancel_existing" || includesAny(text, [
    /\bcancel\b/,
    /\bdon'?t\s+(come|send|need)\b/,
    /\bno\s+longer\s+need\b/,
    /\bwe'?re\s+good\b/,
    /\btake\s+(me|us)\s+off\b.*\bschedule\b/,
    /\bgot\s+it\s+handled\b/,
    /\bdecided\s+not\s+to\s+do\s+the\s+work\b/,
    /\bstop\s+the\s+appointment\b/,
    /\bgoing\s+to\s+wait\b.*\bcancel\b/,
  ]);
  const hasConfirm = extracted.intent === "confirmation" || includesAny(text, [
    /\b(confirm|confirmed|yes that works|yes sir.*works|yes ma'?am.*confirm|that time works|that window works|sounds good|see you then)\b/,
    /\b(that|friday morning|10 to 12|ten to twelve)\s+(works|is fine|is good)\b/,
    /\b(works for me|perfect,?\s+thank you|ok that'?s good|good deal|we'?ll be home|we'?ll see .* then|we can do that time|that'?s fine with us)\b/,
    /\bappointment\s+time\s+is\s+good\b/,
    /\b(yes|yep|ok|okay).*\b(works|confirmed|fine|home|there)\b/,
    /\bkeep us on the schedule\b/,
  ]);
  const hasBilling = includesAny(text, [
    /\b(invoice|payment|payments|paid|pay|card|receipt|balance|bill|billing|charged|owed|deposit)\b/,
    /\bpayment\s+link\b/,
    /\bcharged\s+twice\b/,
    /\bleft\s+owed\b/,
  ]);
  const hasWarranty = includesAny(text, [
    /\b(warranty|labor warranty|parts warranty|comfort club|membership|maintenance plan|service agreement)\b/,
    /\b(cps|rebate|city inspection|inspection pass|inspection passed|permit|registered|equipment registered|carrier get registered|day\s*(and|&)\s*night.*registered)\b/,
    /\b(rebate|inspection|warranty)\s+(paperwork|form|status)\b/,
  ]);
  const hasMembershipStatusQuestion = includesAny(text, [
    /\b(comfort club|membership|maintenance plan|service agreement)\b.*\b(active|expire|expires|expired|paid up|status|next)\b/,
    /\bwhen\s+is\s+my\s+next\s+(comfort club|maintenance|service agreement)\b/,
  ]);
  const hasQuoteFollowUp = ["estimate_followup", "quote_request", "quote_follow_up"].includes(String(extracted.call_intent || extracted.intent || "")) || includesAny(text, [
    /\b(quote|estimate|bid|proposal|price|pricing|option|financing|approved|approve|decline)\b/,
    /\bhow\s+much\b.*\b(system|unit|carrier|day\s*(and|&)\s*night|goodman|install|installed|ton)\b/,
    /\bwhat\s+would\b.*\b(system|unit|carrier|day\s*(and|&)\s*night|goodman|install|installed|ton)\b.*\b(cost|run)\b/,
    /\bneed\s+(numbers|pricing|price)\b.*\b(system|unit|carrier|day\s*(and|&)\s*night|goodman|performance|install|replacement)\b/,
    /\b(send|resend)\b.*\b(replacement|repair|install)\s+options\b/,
    /\b(work|write|make|build|send|prepare)\s+(up\s+)?(a\s+)?(quote|estimate|bid|proposal)\b/,
    /\b(carport|flat roof|wood|shingles|metal)\b.*\b(quote|estimate|bid|price)\b/,
  ]);
  const hasQuoteDecision = hasQuoteFollowUp && includesAny(text, [
    /\b(approve|approved|approval|accept|accepted|go ahead|move forward|looks good|let'?s do it|we'?re ready|sign me up)\b/,
    /\b(customer|homeowner|they|we|i)\s+(approved|accepted|want|wants)\b/,
  ]);
  const hasComplaint = extracted.intent === "complaint" || includesAny(text, [
    /\b(complaint|upset|angry|not happy|still not working|never fixed|bad service)\b/,
    /\b(you|y'all|ya'll|yall|the tech|technician)\s+(fixed|worked on|came out).*\bstill\s+(not|isn'?t|ain'?t)\b/,
    /\bstill\s+(not|isn'?t|ain'?t)\s+(cooling|heating|working|fixed)\b/,
    /\b(still|same|again|back)\b.*\b(after|since)\b.*\b(repair|service|visit|tech|technician|jonathan|clint|worked|came)\b/,
    /\b(came out|worked on|left|completed|fixed|repaired|said it was fixed|paid yesterday)\b.*\b(still|again|back|same|hot|leaking|noise|not)\b/,
    /\b(come back out|same issue|same problem|third time|problem is back|same code came back)\b/,
    /\bsame\s+noise\s+again\b/,
    /\bsaid\s+it\s+was\s+fixed\b.*\b(ain'?t|isn'?t|not)\b/,
    /\b(new motor|new part|repair)\b.*\b(noise|not working|failed|bad)\b/,
  ]);
  const hasMaintenance = extracted.service_type === "maintenance" || includesAny(text, [
    /\b(maintenance|tune\s*-?\s*up|spring check|fall check|seasonal maintenance|preseason check|preseason checkup|heat check|yearly ac maintenance)\b/,
    /\b(comfort club|club members|service agreement|maintenance plan)\b.*\b(schedule|visit|check|inspection|maintenance|tune)\b/,
    /\b(filters? checked|twice a year|seasonal check)\b/,
  ]);
  const hasEstimateRequest = extracted.service_type === "estimate" || extracted.service_type === "install" || includesAny(text, [
    /\b(estimate|quote|replace|replaced|replacement|new system|new unit|install|installing|installation|changeout|full system|system changeout|size a new system)\b/,
    /\b(new|replace|replacing|replaced|replacement)\b.*\b(ac|a\/c|system|unit|heat pump|air handler|condenser|gas heat)\b/,
    /\binstalling\b.*\b(mini split|system|unit|heat pump|ac|a\/c)\b/,
    /\b(look at|measure for|come size|consultation|replacement visit)\b.*\b(new|replacement|replace|install)\b/,
  ]);
  const hasBooking = extracted.intent === "booking" || extracted.call_intent === "new_booking" || includesAny(text, [
    /\b(schedule|book|appointment|come out|send someone|need someone|service call)\b/,
    /\b(ac|a\/c|air conditioner|heater|heat pump|furnace|mini split|condenser|air handler|outside unit|inside unit)\b.*\b(broken|quit|dead|not working|not cooling|not heating|leaking|making noise|humming|buzzing|tripping|iced|smells|won'?t light|stopped cooling)\b/,
    /\ba\/c\b.*\b(keeping up|not keeping up)\b/,
    /\b(unit|system|coil|line)\b.*\b(froze|frozen|iced|icing|leaking|dripping)\b/,
    /\b(unit|system|condenser|fan|outside)\b.*\b(humming|buzzing|tripping|dead|quit|not running|barely cool|turning on and off|short cycling|won'?t kick on|getting hot)\b/,
    /\b(blowing|blows)\s+(hot|warm)\s+air\b/,
    /\b(no|barely)\s+(cool|cold)\s+air\b/,
    /\bhouse\s+is\s+\d{2,3}\s+degrees\b/,
    /\bdrain\s+line\b.*\b(backed up|clogged|leaking|water)\b/,
    /\bwater\b.*\b(ceiling|hallway|overflow|drain)\b/,
    /\bthermostat\b.*\b(blank|dead|not working|won'?t turn on)\b/,
    /\bthermostat\b.*\b(cool on|nothing is running)\b/,
    /\b(outside|outdoor|condenser)\s+unit\b.*\b(won'?t|will not|doesn'?t|does not)\s+(kick|come|turn)\s+on\b/,
    /\bheater\b.*\b(won'?t|will not|doesn'?t|does not)\s+(turn|come|kick)\s+on\b/,
  ]);
  const isInfoReply = extracted.intent === "info_reply" || includesAny(text, [
    /\b(my name is|address is|email is|phone number is)\b/,
    /\b(name is|customer name is|last name is|email changed|phone changed|update my phone|service address is|address is|best email is|the contact is)\b/,
    /\bbilling\s+address\b/,
    /\b(this is for|it'?s under my|under my wife'?s name|under my husband'?s name)\b/,
    /\b(job|appointment|service)\s+is\s+at\b/,
    /\b\d{3,5}\s+([a-z0-9'.-]+\s+){1,5}(rd|road|dr|drive|st|street|ave|lane|ln|court|ct|orchard|trail|trl|cr|county road)\b/,
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/,
  ]);
  const isCapabilityQuestion = includesAny(text, [
    /\bdo\s+y'?all\s+(offer|do|service|install|work|sell|carry|take)\b/,
    /\bdo\s+you\s+(offer|do|service|install|work|sell|carry|take)\b/,
    /\bare\s+you\s+(open|licensed|insured|family owned)\b/,
    /\bwhat\s+(areas|brands|time)\s+do\s+y'?all\b/,
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

  if (hasMaintenance && !hasActiveWork && !hasMembershipStatusQuestion) return specific("maintenance_request", "new_appointment", "Prepare a maintenance visit booking card", "Customer appears to want maintenance.");
  if (hasComplaint) return specific("complaint", "thread_attention", `Review ${workRef} and escalate if needed`, "Customer appears unhappy or the issue may still be unresolved.");
  if (hasReschedule) return specific("reschedule_existing_work", "schedule_change", `Review ${workRef} and offer a new arrival window`, "Customer is trying to move an existing appointment.");
  if (hasCancel) return specific("cancel_existing_work", "schedule_change", `Review ${workRef} before canceling anything`, "Customer may be canceling existing work.");
  if (hasCallbackUpdate) return specific("callback_number_update", "contact_update", `Save the callback preference and tell the tech which number to use`, "Customer provided a different callback or text number.");
  if (hasEtaRequest) return specific("eta_request", "eta_request", `Check dispatch board and send an ETA update for ${workRef}`, "Customer is asking when someone will arrive.");
  if (hasAccess) return specific("access_instructions", "access_note", `Attach access instructions to ${workRef}`, "Customer provided gate, lockbox, door, or entry instructions.");
  if (hasPetWarning) return specific("pet_warning", "pet_warning", `Add pet/access warning to ${workRef}`, "Customer warned us about pets or site access.");
  if (isInfoReply && /\b(address|email|phone|name)\b/.test(text) && !(hasBooking || hasEstimateRequest || hasMaintenance)) return specific("customer_info_update", "thread_attention", "Update the customer record or existing pending card", "Customer provided contact details.");
  if (hasWarranty) return specific("warranty_or_membership_question", "thread_attention", "Review warranty or Comfort Club status and reply", "Customer is asking about warranty or membership.");
  if (hasBilling) return specific("billing_question", "thread_attention", "Review billing/payment context and reply", "Customer is asking about billing or payment.");
  if (isCapabilityQuestion && !hasActiveWork) {
    return {
      intent: "general_question",
      confidence: "medium",
      summary: firstNonEmpty(extracted.summary, extracted.problem_description, args.text.slice(0, 180)) || "",
      shouldCreateNewWork: false,
      shouldAttachToExistingWork: false,
      actionCategory: "new_lead",
      suggestedAction: "Answer the customer question and decide whether this should become work",
      extractedFields: fields,
      reason: "Customer is asking a general capability or service-area question.",
    };
  }
  if (hasQuoteDecision) {
    return specific("quote_follow_up", "follow_up", hasActiveWork ? `Review ${workRef} and move the quote/proposal forward` : "Create or update the quote follow-up card for human approval", "Customer appears to be approving, choosing, or moving forward on a quote/proposal.");
  }
  if (hasQuoteFollowUp && hasActiveWork && !explicitSeparateWork) {
    return specific("quote_follow_up", "follow_up", `Review ${workRef} and follow up on quote/proposal`, "Customer is discussing an existing estimate or proposal.");
  }
  if ((extracted.intent === "quote_request" || extracted.intent === "quote_follow_up" || hasQuoteFollowUp) && !hasActiveWork) {
    return specific("quote_follow_up", "follow_up", "Prepare the quote/bid and send it to the customer", "Customer is asking for a quote or we promised to prepare one.");
  }
  if (hasConfirm) return specific("confirm_existing_work", "confirmation", `Mark ${workRef} as confirmed`, "Customer confirmed an existing appointment.");
  if (isInfoReply && !(hasBooking || hasEstimateRequest || hasMaintenance)) return specific("customer_info_update", "thread_attention", "Update the customer record or existing pending card", "Customer provided contact details.");
  if (hasActiveWork && !explicitSeparateWork && (hasBooking || isInfoReply || text.length > 0)) {
    return specific("customer_info_update", "follow_up", `Attach this update to ${workRef}`, "Customer has active work, so defaulting to update instead of new booking.");
  }
  if (hasEstimateRequest) return specific("new_estimate_request", "new_appointment", "Prepare a replacement estimate booking card", "Customer appears to want a quote or replacement estimate.");
  if (hasBooking) return specific("new_service_booking", "new_appointment", "Prepare a service booking card", "Customer appears to want a new service visit.");

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
