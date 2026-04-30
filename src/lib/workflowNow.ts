import { addDays, differenceInCalendarDays, isBefore, parseISO } from "date-fns";
import { getExpectedJobItems, type ExpectedJobItem } from "@/lib/expectedJobItems";

export type WorkflowType = "intake" | "estimate" | "install" | "service" | "lead";
export type WorkflowOwner = "office" | "tech" | "customer" | "system";
export type WorkflowGroup = "ready" | "past_due" | "follow_up" | "closeout" | "waiting";

export type WorkflowStepDefinition = {
  key: string;
  title: string;
  label?: string;
  owner: WorkflowOwner;
  mode?: "manual" | "auto" | "autopilot" | "skippable";
  formSections?: string[];
  description?: string;
  jarvisInstructions?: string;
  requiredContext?: string[];
  actionLinks?: WorkflowActionLink[];
};

export type WorkflowActionLink = {
  label: string;
  url: string;
  kind?: "vendor" | "jurisdiction" | "permit" | "reference" | "internal";
  when?: string;
  brandIncludes?: string[];
};

export type WorkflowNowCard = {
  id: string;
  workflowType: WorkflowType;
  recordType: "action" | "job" | "estimate" | "lead" | "alert";
  recordId: string;
  recordNumber?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  address?: string | null;
  status?: string | null;
  source?: string | null;
  description?: string | null;
  title: string;
  subtitle: string;
  owner: WorkflowOwner;
  group: WorkflowGroup;
  route: string;
  stepNumber: number;
  totalSteps: number;
  dueAt?: string | null;
  progress: number;
  stuckReason: string;
  jarvisRecommendation: string;
  tags: string[];
  actionLinks?: WorkflowActionLink[];
};

export const NOW_HQ_LAUNCH_CUTOFF = "2026-04-30T00:00:00.000Z";

export const ESTIMATE_WORKFLOW: WorkflowStepDefinition[] = [
  { key: "schedule_estimate", title: "Schedule Estimate Visit", owner: "office", mode: "auto" },
  { key: "assign_sales_tech", title: "Assign Sales Tech", owner: "office" },
  { key: "appointment_reminder", title: "Text Customer Appointment Reminder", owner: "system", mode: "auto" },
  { key: "sales_details", title: "Text Job Details to Sales Tech", owner: "office", mode: "auto" },
  { key: "eta", title: "Text ETA to Customer", owner: "tech", mode: "auto" },
  { key: "on_site", title: "Mark Tech On-Site", owner: "tech" },
  { key: "sales_checklist", title: "Send Sales Checklist to Tech", owner: "tech", mode: "auto", formSections: ["Photos", "Specs", "Conditions", "Notes"] },
  { key: "review_estimate", title: "Review & Approve Estimate", owner: "office" },
  { key: "brochure", title: "Email Brochure to Customer", owner: "office" },
  { key: "won_lost", title: "Mark Won / Lost", owner: "customer" },
];

export const INSTALL_WORKFLOW: WorkflowStepDefinition[] = [
  {
    key: "equipment_ordered",
    title: "Order Equipment & Check Availability",
    owner: "office",
    description: "Use the approved quote/equipment selection to open the right supplier portal and confirm stock/lead time.",
    jarvisInstructions: "Look at the approved estimate/cart/job line items first. If the approved system is Carrier, point dispatch to Carrier Enterprise. If it is Day & Night/ICP, point dispatch to SIBI Pro/Robert Madden. If brand is missing, ask for brand before surfacing an order link.",
    requiredContext: ["approved equipment brand", "tonnage", "system type", "tier", "orientation/location"],
    actionLinks: [
      { label: "Carrier Enterprise", url: "https://www.carrierenterprise.com/", kind: "vendor", when: "Approved system brand is Carrier", brandIncludes: ["carrier"] },
      { label: "SIBI Pro", url: "https://web.sibipro.com/home", kind: "vendor", when: "Approved system brand is Day & Night / ICP", brandIncludes: ["day & night", "day and night", "icp"] },
    ],
  },
  { key: "schedule_install", title: "Schedule Install Date", owner: "office", mode: "autopilot" },
  { key: "assign_installer", title: "Assign Installer Crew", owner: "office", mode: "autopilot" },
  {
    key: "jurisdiction",
    title: "Lookup Jurisdiction",
    owner: "system",
    mode: "autopilot",
    description: "Confirm which city/county authority owns permits and inspections for the customer address.",
    jarvisInstructions: "Use the job address to lookup jurisdiction. Store the resolved authority and permit/inspection links on the job so the permit step can use them.",
    requiredContext: ["customer address", "city", "zip code"],
    actionLinks: [
      { label: "Jurisdiction map", url: "https://www.randymajors.org/city-limits-on-google-maps", kind: "jurisdiction", when: "Use when jurisdiction is uncertain" },
    ],
  },
  {
    key: "permit",
    title: "Pull Permit / Mark Not Needed",
    owner: "office",
    description: "Open the resolved permit portal, or mark permit not required if the authority says no permit is needed.",
    jarvisInstructions: "Prefer the job permit portal URL. If missing, use the permit authority tied to the detected jurisdiction. Do not guess; ask dispatch to verify if no portal is known.",
    requiredContext: ["jurisdiction", "permit required", "permit portal URL"],
    actionLinks: [
      { label: "Open permit portal", url: "{{job.permit_portal_url}}", kind: "permit", when: "Job has a permit portal URL" },
    ],
  },
  { key: "deposit", title: "Collect Deposit via Stripe", owner: "customer", mode: "skippable" },
  { key: "finance", title: "Complete Finance Paperwork", owner: "office", mode: "skippable" },
  { key: "appointment_reminder", title: "Text Customer Appointment Reminder", owner: "system", mode: "auto" },
  { key: "install_checklist", title: "Send Install Checklist to Installer", owner: "tech", mode: "auto", formSections: ["Pick Up", "Before"] },
  { key: "installer_details", title: "Text Job Details to Installer", owner: "office", mode: "auto" },
  { key: "eta", title: "Text ETA to Customer", owner: "tech", mode: "auto" },
  { key: "on_site", title: "Mark Crew On-Site", owner: "tech" },
  { key: "completion_checklist", title: "Send Install Completion Checklist", owner: "tech", mode: "auto", formSections: ["Specs", "After", "Completion"] },
  { key: "photos", title: "Confirm Photos Uploaded", owner: "office", mode: "autopilot" },
  { key: "invoice", title: "Send Invoice to Customer", owner: "office", mode: "autopilot" },
  { key: "payment", title: "Confirm Payment Received", owner: "customer" },
  { key: "review", title: "Text Google Review Link", owner: "system", mode: "auto" },
  { key: "warranty", title: "Register Warranty", owner: "office", mode: "autopilot" },
  { key: "rebate", title: "Submit CPS Rebate", owner: "office", mode: "skippable" },
  { key: "inspection", title: "Schedule City Inspection", owner: "office", mode: "skippable" },
  { key: "inspection_passed", title: "Mark Inspection Passed", owner: "office", mode: "skippable" },
  { key: "quality_check", title: "7-Day Quality Check Text", owner: "system", mode: "autopilot" },
];

export const SERVICE_WORKFLOW: WorkflowStepDefinition[] = [
  { key: "schedule_service", title: "Schedule Service Date", owner: "office", mode: "autopilot" },
  { key: "assign_service_tech", title: "Assign Service Tech", owner: "office", mode: "autopilot" },
  { key: "appointment_reminder", title: "Text Customer Appointment Reminder", owner: "system", mode: "auto" },
  { key: "tech_details", title: "Text Job Details to Tech", owner: "office", mode: "auto" },
  { key: "eta", title: "Text ETA to Customer", owner: "tech", mode: "auto" },
  { key: "on_site", title: "Mark Tech On-Site", owner: "tech" },
  { key: "service_checklist", title: "Send Service Checklist to Tech", owner: "tech", mode: "auto", formSections: ["Pick Up", "Before", "Diagnosis", "After", "Completion"] },
  { key: "photos", title: "Confirm Photos Uploaded", owner: "office", mode: "autopilot" },
  { key: "invoice", title: "Send Invoice to Customer", owner: "office", mode: "autopilot" },
  { key: "payment", title: "Confirm Payment Received", owner: "customer" },
  { key: "review", title: "Text Google Review Link", owner: "system", mode: "auto" },
  { key: "quality_check", title: "Quality Check Text", owner: "system", mode: "autopilot" },
];

export const UNIVERSAL_TECH_WORKFLOW: WorkflowStepDefinition[] = [
  { key: "on_my_way", title: "On My Way", owner: "tech", mode: "auto" },
  { key: "arrive", title: "Arrive", owner: "tech" },
  { key: "snap_photos", title: "Snap Photos", owner: "tech", mode: "autopilot", formSections: ["AI OCR extracts specs"] },
  { key: "voice_memo", title: "Voice Memo", owner: "tech", mode: "autopilot", formSections: ["Deepgram", "Gemini"] },
  { key: "ai_review", title: "AI Review", owner: "system", mode: "autopilot", formSections: ["Editable summary"] },
  { key: "add_parts", title: "Add Parts", owner: "tech", formSections: ["Pricebook", "JARVIS"] },
  { key: "after_photos", title: "After Photos", owner: "tech", formSections: ["Document work"] },
  { key: "submit", title: "Submit", owner: "tech", formSections: ["Advances workflow"] },
];

export const LEAD_DRIP_WORKFLOW: WorkflowStepDefinition[] = [
  { key: "new_lead", title: "Capture Lead", owner: "system", mode: "auto" },
  { key: "first_response", title: "First Response / Qualify", owner: "office", mode: "autopilot" },
  { key: "quote_or_booking", title: "Book Estimate or Start Quote", owner: "office" },
  { key: "drip_one", title: "Follow-Up Touch 1", owner: "system", mode: "autopilot" },
  { key: "drip_two", title: "Follow-Up Touch 2", owner: "system", mode: "autopilot" },
  { key: "final_touch", title: "Final Check-In", owner: "system", mode: "autopilot" },
  { key: "closed", title: "Won / Lost / Nurture", owner: "office" },
];

export const CUSTOMER_INTAKE_WORKFLOW: WorkflowStepDefinition[] = [
  { key: "identify", title: "Identify Customer", owner: "system", mode: "auto" },
  { key: "understand", title: "Understand Intent", owner: "system", mode: "auto" },
  { key: "merge", title: "Merge New Context Into Card", owner: "system", mode: "auto" },
  { key: "review", title: "Human Review", owner: "office" },
  { key: "convert", title: "Book, Update, Quote, or Nurture", owner: "office" },
];

export const WORKFLOW_TEMPLATES: Record<WorkflowType, WorkflowStepDefinition[]> = {
  intake: CUSTOMER_INTAKE_WORKFLOW,
  estimate: ESTIMATE_WORKFLOW,
  install: INSTALL_WORKFLOW,
  service: SERVICE_WORKFLOW,
  lead: LEAD_DRIP_WORKFLOW,
};

export type WorkflowTemplateMap = Partial<Record<WorkflowType, WorkflowStepDefinition[]>>;

export function templatesWithOverrides(overrides?: WorkflowTemplateMap): Record<WorkflowType, WorkflowStepDefinition[]> {
  return {
    ...WORKFLOW_TEMPLATES,
    ...(overrides || {}),
  };
}

function normalized(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isLegacyHcpImport(row: any) {
  return Boolean(row?.hcp_id);
}

function isLegacyLeadImport(row: any) {
  const source = normalized(row?.source);
  const created = dateOnly(row?.created_at);
  const cutoff = dateOnly(NOW_HQ_LAUNCH_CUTOFF);
  return source === "google_lsa" && Boolean(created && cutoff && isBefore(created, cutoff));
}

function isTerminalStatus(status?: string | null) {
  return [
    "canceled",
    "cancelled",
    "done",
    "invoiced",
    "completed",
    "complete",
    "closed",
    "legacy_complete",
    "created job from estimate",
    "pro canceled",
    "user canceled",
    "complete rated",
    "complete unrated",
  ].includes(normalized(status));
}

function customerName(row: any) {
  return row.customer_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.name || row.company || "Unknown customer";
}

function recordNumber(...values: Array<string | number | null | undefined>) {
  const found = values.find((value) => value !== null && value !== undefined && String(value).trim());
  return found ? String(found) : null;
}

function dateOnly(value?: string | null) {
  if (!value) return null;
  try {
    return parseISO(value.length <= 10 ? `${value}T12:00:00` : value);
  } catch {
    return null;
  }
}

function isPastDue(dueAt?: string | null) {
  const due = dateOnly(dueAt);
  if (!due) return false;
  return isBefore(due, new Date());
}

function groupFor(title: string, status: string, dueAt?: string | null): WorkflowGroup {
  const lower = title.toLowerCase();
  if (isPastDue(dueAt) && status !== "waiting") return "past_due";
  if (/(warranty|inspection|rebate|quality)/.test(lower)) return "closeout";
  if (/(follow|won|lost|brochure|decision|drip|quote)/.test(lower)) return "follow_up";
  if (status === "waiting" || /waiting|customer/.test(status)) return "waiting";
  return "ready";
}

function progressFromStep(stepNumber: number, totalSteps: number) {
  if (!totalSteps) return 0;
  return Math.max(0, Math.min(100, Math.round(((stepNumber - 1) / totalSteps) * 100)));
}

function recommendationFor(cardTitle: string, owner: WorkflowOwner, recordLabel: string) {
  if (owner === "system") return `Jarvis should run or verify "${cardTitle}" and only alert dispatch if it fails.`;
  if (owner === "customer") return `Watch for customer response on ${recordLabel}. If no movement, queue a friendly Carnes follow-up.`;
  if (owner === "tech") return `Keep the universal tech flow moving: on my way, arrive, photos, voice memo, AI review, parts, after photos, submit.`;
  return `Put this in front of dispatch: ${cardTitle}. Once confirmed, flip the workflow to the next card.`;
}

function contextText(row: any) {
  return [
    row?.brand,
    row?.system_type,
    row?.equipment_type,
    row?.description,
    row?.notes,
    row?.approved_option,
    row?.selected_option,
  ].filter(Boolean).join(" ").toLowerCase();
}

function readPath(row: any, path: string) {
  const clean = path.replace(/^\{\{|\}\}$/g, "").trim();
  const parts = clean.split(".").filter(Boolean);
  const skipRoot = ["job", "estimate", "lead", "row"].includes(parts[0]);
  let value = row;
  for (const part of parts.slice(skipRoot ? 1 : 0)) {
    value = value?.[part];
  }
  return typeof value === "string" ? value.trim() : value;
}

function resolveActionLinks(step: WorkflowStepDefinition, row: any): WorkflowActionLink[] {
  const text = contextText(row);
  return (step.actionLinks || []).flatMap((link) => {
    if (link.brandIncludes?.length && !link.brandIncludes.some((brand) => text.includes(brand.toLowerCase()))) return [];
    let url = link.url;
    const placeholder = url.match(/^\{\{(.+)\}\}$/);
    if (placeholder) {
      const value = readPath(row, placeholder[0]);
      if (!value) return [];
      url = String(value);
    }
    return [{ ...link, url }];
  });
}

function mapExpectedKeyToTemplateKey(item: ExpectedJobItem, workflowType: WorkflowType) {
  if (workflowType === "install") {
    const map: Record<string, string> = {
      equipment_ordered: "equipment_ordered",
      scheduled: "schedule_install",
      assigned: "assign_installer",
      deposit: "deposit",
      preinstall: "appointment_reminder",
      confirmation: "appointment_reminder",
      dispatch: "installer_details",
      on_site: "on_site",
      completion: "completion_checklist",
      cart_sent: "invoice",
      cart_approved: "payment",
      financing_pending: "finance",
      pay_after_work: "payment",
      invoice: "invoice",
      payment: "payment",
      review: "review",
      warranty: "warranty",
      inspection: "inspection",
      rebate: "rebate",
      follow_up: "quality_check",
    };
    return map[item.key] || item.key;
  }

  const map: Record<string, string> = {
    scheduled: "schedule_service",
    assigned: "assign_service_tech",
    confirmation: "appointment_reminder",
    dispatch: "tech_details",
    on_site: "on_site",
    completion: "service_checklist",
    cart_sent: "invoice",
    cart_approved: "payment",
    financing_pending: "payment",
    pay_after_work: "payment",
    invoice: "invoice",
    payment: "payment",
    review: "review",
    follow_up: "quality_check",
    maintenance_report: "service_checklist",
    next_visit: "quality_check",
  };
  return map[item.key] || item.key;
}

function resolveTemplateStep(template: WorkflowStepDefinition[], key: string, fallback: ExpectedJobItem) {
  const foundIndex = template.findIndex((step) => step.key === key);
  if (foundIndex >= 0) {
    return {
      stepIndex: foundIndex,
      step: template[foundIndex],
    };
  }

  return {
    stepIndex: Math.max(0, Math.min(template.length, template.length - 1)),
    step: {
      key: fallback.key,
      title: fallback.label,
      owner: fallback.owner,
    } as WorkflowStepDefinition,
  };
}

function openItem(items: ExpectedJobItem[]) {
  return items.find((item) => item.status === "needs_attention")
    || items.find((item) => item.status === "waiting")
    || items.find((item) => item.status === "upcoming");
}

export function buildJobWorkflowCard(
  job: any,
  templateOverrides?: WorkflowTemplateMap,
  context?: { invoices?: any[]; partsOrders?: any[]; cart?: any | null }
): WorkflowNowCard | null {
  if (isLegacyHcpImport(job)) return null;

  const type = normalized(job.job_type);
  const workflowType: WorkflowType = type === "install" ? "install" : "service";
  const template = templatesWithOverrides(templateOverrides)[workflowType];
  const items = getExpectedJobItems(job, context?.invoices || [], context?.partsOrders || [], context?.cart || null);
  const active = openItem(items);
  if (!active) return null;
  const terminal = isTerminalStatus(job?.status) || isTerminalStatus(job?.hcp_status);
  const closeoutKeys = new Set(["invoice", "payment", "review", "follow_up", "warranty", "inspection", "rebate"]);
  if (terminal && !closeoutKeys.has(active.key)) return null;

  const templateKey = mapExpectedKeyToTemplateKey(active, workflowType);
  const { stepIndex, step } = resolveTemplateStep(template, templateKey, active);
  const dueAt = job.scheduled_date || job.created_at || null;
  const recordLabel = `job #${job.job_number || job.hcp_job_number || String(job.id).slice(0, 8)}`;

  return {
    id: `job-${job.id}-${step.key}`,
    workflowType,
    recordType: "job",
    recordId: job.id,
    recordNumber: recordNumber(job.job_number, job.hcp_job_number, job.id && String(job.id).slice(0, 8)),
    customerName: customerName(job),
    customerPhone: job.customer_phone,
    customerEmail: job.customer_email,
    address: job.address,
    status: job.status,
    source: job.job_type,
    description: job.description,
    title: step.title,
    subtitle: active.reason,
    owner: step.owner,
    group: groupFor(step.title, active.status, dueAt),
    route: `/jobs/${job.id}`,
    stepNumber: stepIndex + 1,
    totalSteps: template.length,
    dueAt,
    progress: progressFromStep(stepIndex + 1, template.length),
    stuckReason: active.reason,
    jarvisRecommendation: recommendationFor(step.title, step.owner, recordLabel),
    tags: [workflowType, active.status, ...(step.formSections || [])],
    actionLinks: resolveActionLinks(step, job),
  };
}

function estimateStep(estimate: any) {
  if (isLegacyHcpImport(estimate) || isTerminalStatus(estimate?.status) || isTerminalStatus(estimate?.work_status) || isTerminalStatus(estimate?.hcp_status)) return null;

  const status = normalized(estimate.work_status || estimate.status);
  const done = ["won", "lost", "canceled"].includes(status);
  if (done) return null;
  if (!estimate.scheduled_date) return "schedule_estimate";
  if (!estimate.assigned_to) return "assign_sales_tech";
  if (!estimate.confirmation_sent_at) return "appointment_reminder";
  if (!estimate.dispatch_sent_at) return "sales_details";
  if (!estimate.on_my_way_sent_at) return "eta";
  if (!["in_progress", "on_site", "completed", "done"].includes(status) && !estimate.completion_form_sent_at) return "on_site";
  if (!estimate.completion_form_sent_at) return "sales_checklist";
  if (!estimate.presentation_sent_at) return "review_estimate";
  if (!estimate.brochure_sent) return "brochure";
  return "won_lost";
}

export function buildEstimateWorkflowCard(estimate: any, templateOverrides?: WorkflowTemplateMap): WorkflowNowCard | null {
  const key = estimateStep(estimate);
  if (!key) return null;
  const template = templatesWithOverrides(templateOverrides).estimate;
  const stepIndex = Math.max(0, template.findIndex((step) => step.key === key));
  const step = template[stepIndex] || {
    key,
    title: key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    owner: "office" as WorkflowOwner,
  };
  const dueAt = estimate.scheduled_date || estimate.created_at || null;
  const recordLabel = `estimate #${estimate.estimate_number || String(estimate.id).slice(0, 8)}`;
  const subtitle = key === "won_lost"
    ? "Quote is in the customer follow-up lane until it is won, lost, or moved to nurture."
    : `${step.title} is the next estimate workflow card.`;

  return {
    id: `estimate-${estimate.id}-${step.key}`,
    workflowType: "estimate",
    recordType: "estimate",
    recordId: estimate.id,
    recordNumber: recordNumber(estimate.estimate_number, estimate.id && String(estimate.id).slice(0, 8)),
    customerName: customerName(estimate),
    customerPhone: estimate.customer_phone,
    customerEmail: estimate.customer_email,
    address: estimate.address,
    status: estimate.work_status || estimate.status,
    source: estimate.sale_source || "estimate",
    description: estimate.description,
    title: step.title,
    subtitle,
    owner: step.owner,
    group: groupFor(step.title, key === "won_lost" ? "waiting" : "needs_attention", dueAt),
    route: `/estimates/${estimate.id}`,
    stepNumber: stepIndex + 1,
    totalSteps: template.length,
    dueAt,
    progress: progressFromStep(stepIndex + 1, template.length),
    stuckReason: subtitle,
    jarvisRecommendation: recommendationFor(step.title, step.owner, recordLabel),
    tags: ["estimate", step.mode || "manual", ...(step.formSections || [])],
    actionLinks: resolveActionLinks(step, estimate),
  };
}

export function buildLeadWorkflowCard(lead: any, templateOverrides?: WorkflowTemplateMap): WorkflowNowCard | null {
  const status = normalized(lead.status || "new");
  if (["converted", "lost", "closed"].includes(status)) return null;
  if (isLegacyLeadImport(lead)) return null;

  const stepIndex = status === "new"
    ? 1
    : lead.drip_next_at
      ? Math.min(5, Math.max(3, Number(lead.drip_step_index || 0) + 3))
      : 2;
  const template = templatesWithOverrides(templateOverrides).lead;
  const step = template[stepIndex] || template[1] || LEAD_DRIP_WORKFLOW[1];
  const dueAt = lead.drip_next_at || addDays(dateOnly(lead.created_at) || new Date(), status === "new" ? 0 : 2).toISOString();
  const daysSince = dateOnly(lead.created_at) ? differenceInCalendarDays(new Date(), dateOnly(lead.created_at)!) : 0;
  const subtitle = lead.drip_next_at
    ? `Next drip touch is queued for this lead. Step ${Number(lead.drip_step_index || 0) + 1}.`
    : status === "new"
      ? "New lead needs qualification, booking, or a quote follow-up path."
      : "Lead was contacted. Decide whether to book, quote, nurture, or mark lost.";

  return {
    id: `lead-${lead.id}-${step.key}`,
    workflowType: "lead",
    recordType: "lead",
    recordId: lead.id,
    recordNumber: recordNumber(lead.lsa_lead_id, lead.id && String(lead.id).slice(0, 8)),
    customerName: customerName(lead),
    customerPhone: lead.phone,
    customerEmail: lead.email,
    address: lead.address,
    status: lead.status,
    source: lead.source,
    description: lead.notes || lead.message || lead.description,
    title: step.title,
    subtitle,
    owner: step.owner,
    group: isPastDue(dueAt) || status === "new" ? "follow_up" : "waiting",
    route: `/leads?source=${encodeURIComponent(lead.source || "all")}`,
    stepNumber: stepIndex + 1,
    totalSteps: template.length,
    dueAt,
    progress: progressFromStep(stepIndex + 1, template.length),
    stuckReason: daysSince > 2 && status === "new" ? "Lead has stayed new for more than two days." : subtitle,
    jarvisRecommendation: status === "new"
      ? "Jarvis should identify intent, draft the first family-voice reply, and ask dispatch to book, quote, or nurture."
      : "Jarvis should keep the drip touch warm without leaving this in Intake.",
    tags: ["lead drip", lead.source || "unknown source", status],
    actionLinks: resolveActionLinks(step, lead),
  };
}

function actionItemStep(item: any) {
  const category = normalized(item.category);
  const metadata = (item.metadata || {}) as any;

  if (metadata.requires_property_selection || category === "address_verify") return "review";
  if (["new_appointment", "booking_confirm"].includes(category)) return "convert";
  if (["new_lead", "thread_attention", "follow_up", "tech_field_update"].includes(category)) return "review";
  if (["schedule_change", "reschedule", "eta_request", "access_note", "pet_warning", "contact_update", "confirmation"].includes(category)) return "review";
  return "understand";
}

function actionItemGroup(item: any): WorkflowGroup {
  const category = normalized(item.category);
  const priority = normalized(item.priority);
  const metadata = (item.metadata || {}) as any;
  if (priority === "critical" || priority === "high") return "ready";
  if (metadata.requires_property_selection || category === "address_verify") return "ready";
  if (["new_appointment", "booking_confirm", "schedule_change", "reschedule", "eta_request", "confirmation", "tech_field_update"].includes(category)) return "ready";
  if (["follow_up", "thread_attention", "new_lead"].includes(category)) return "follow_up";
  return "ready";
}

function actionItemTitle(item: any, stepTitle: string) {
  const metadata = (item.metadata || {}) as any;
  const intent = String(metadata.jarvis_intent || item.category || "").replaceAll("_", " ");
  if (item.suggested_action) return item.suggested_action;
  if (intent.trim()) return `${stepTitle}: ${intent}`;
  return item.title || stepTitle;
}

export function buildActionItemWorkflowCard(item: any, templateOverrides?: WorkflowTemplateMap): WorkflowNowCard | null {
  if (!item || normalized(item.status || "pending") !== "pending") return null;

  const template = templatesWithOverrides(templateOverrides).intake;
  const key = actionItemStep(item);
  const stepIndex = Math.max(0, template.findIndex((step) => step.key === key));
  const step = template[stepIndex] || template[3];
  const metadata = (item.metadata || {}) as any;
  const customer = metadata.customer_name || metadata.name || item.title || "Customer";
  const phone = item.customer_phone || metadata.phone || metadata.customer_phone || metadata.callback_phone || null;
  const description = item.description || metadata.description || metadata.thread_snippet || metadata.inbound_message || "";
  const lastEvidence =
    metadata.call_id ? `Call ${String(metadata.call_id).slice(0, 8)}` :
    metadata.sms_extraction || metadata.inbound_message ? "Latest SMS" :
    metadata.updated_from ? String(metadata.updated_from) :
    item.source || "Jarvis";

  return {
    id: `action-${item.id}`,
    workflowType: "intake",
    recordType: "action",
    recordId: item.id,
    recordNumber: String(item.id).slice(0, 8),
    customerName: customer,
    customerPhone: phone,
    customerEmail: metadata.email || null,
    address: metadata.address || metadata.mentioned_address || null,
    status: item.status,
    source: item.category,
    description,
    title: actionItemTitle(item, step.title),
    subtitle: item.title || `Jarvis updated this live intake card from ${lastEvidence}.`,
    owner: step.owner,
    group: actionItemGroup(item),
    route: phone ? `/intake?phone=${encodeURIComponent(phone)}` : "/intake",
    stepNumber: stepIndex + 1,
    totalSteps: template.length,
    dueAt: item.created_at,
    progress: progressFromStep(stepIndex + 1, template.length),
    stuckReason: item.suggested_action || item.description || "Jarvis needs a human to approve the next move.",
    jarvisRecommendation:
      "Review the latest call/text context. If the customer changed direction, this same card should be updated instead of creating a duplicate.",
    tags: ["intake", item.category, item.priority, lastEvidence].filter(Boolean),
    actionLinks: resolveActionLinks(step, item),
  };
}

function workflowTypeFromAlert(alert: any): WorkflowType {
  const job = alert?.jobs || alert?.job || {};
  const jobType = normalized(job?.job_type || alert?.workflow_type || alert?.job_type);
  if (jobType === "install") return "install";
  if (jobType === "estimate") return "estimate";
  if (jobType === "lead") return "lead";
  if (jobType === "intake") return "intake";
  return "service";
}

function alertStep(alert: any, template: WorkflowStepDefinition[]) {
  const stepId = normalized(alert?.step_id);
  const index = Math.max(0, template.findIndex((step) =>
    normalized(step.key) === stepId ||
    normalized((step as any).id) === stepId ||
    normalized(step.title) === stepId
  ));
  return {
    index,
    step: template[index] || template[0],
  };
}

export function buildWorkflowAlertCard(alert: any, templateOverrides?: WorkflowTemplateMap): WorkflowNowCard | null {
  if (!alert || alert.resolved_at || alert.is_active === false) return null;

  const workflowType = workflowTypeFromAlert(alert);
  const template = templatesWithOverrides(templateOverrides)[workflowType] || templatesWithOverrides(templateOverrides).service;
  const { index, step } = alertStep(alert, template);
  const job = alert.jobs || alert.job || {};
  const details = alert.details && typeof alert.details === "object" ? alert.details : {};
  const missingFields = Array.isArray(alert.missing_fields) ? alert.missing_fields.filter(Boolean) : [];
  const customerName = job.customer_name || details.customer_name || "Workflow blocked";
  const message = alert.message || details.message || "";
  const stepLabel = step?.title || alert.step_id || "Workflow step";
  const description = [
    message,
    missingFields.length ? `Missing: ${missingFields.join(", ")}` : "",
    details.reason || details.description || "",
  ].filter(Boolean).join(" ");

  return {
    id: `alert-${alert.id}`,
    workflowType,
    recordType: "alert",
    recordId: alert.id,
    recordNumber: job.job_number || String(alert.id).slice(0, 8),
    customerName,
    customerPhone: job.customer_phone || details.customer_phone || null,
    customerEmail: job.customer_email || null,
    address: job.address || details.address || null,
    status: alert.alert_type || "blocked",
    source: "workflow alert",
    description,
    title: `Blocked: ${stepLabel}`,
    subtitle: job.job_number ? `Job #${job.job_number} needs attention before this workflow can move forward.` : "Jarvis found a blocked workflow step.",
    owner: step?.owner || "office",
    group: "past_due",
    route: job.id ? `/jobs/${job.id}` : "/now",
    stepNumber: index + 1,
    totalSteps: template.length,
    dueAt: alert.created_at,
    progress: progressFromStep(index + 1, template.length),
    stuckReason: description || "This workflow alert is active and unresolved.",
    jarvisRecommendation: "Open the related record, fix the blocker, then resolve the workflow alert so the card leaves Now HQ.",
    tags: ["blocked", workflowType, alert.step_id, alert.alert_type, ...missingFields].filter(Boolean),
    actionLinks: resolveActionLinks(step, { ...job, ...details }),
  };
}
