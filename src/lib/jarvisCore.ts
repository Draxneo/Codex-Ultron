export const JARVIS_BRAINS = [
  {
    key: "intake",
    label: "Intake Brain",
    owns: "Who / What / Why",
    routes: ["/intake"],
    purpose: "Understand calls, SMS, customer match, intent, missing info, and prepared actions.",
  },
  {
    key: "dispatch",
    label: "Operations Brain",
    owns: "When / Where",
    routes: ["/dispatch"],
    purpose: "Run the day, routes, tech assignment, schedule risk, and customer updates.",
  },
  {
    key: "field",
    label: "Field Brain",
    owns: "Who / What / When / Where / Why",
    routes: ["/tech"],
    purpose: "Help techs diagnose, document, build options, and send approvals.",
  },
  {
    key: "customer",
    label: "Customer Brain",
    owns: "Relationship memory",
    routes: ["/customers"],
    purpose: "Remember jobs, estimates, conversations, attachments, warranties, and memberships.",
  },
  {
    key: "quote",
    label: "Quote Brain",
    owns: "Follow-up pipeline",
    routes: ["/quick-quote"],
    purpose: "Track open quotes, customer responses, follow-up drafts, approvals, and lost/won outcomes.",
  },
  {
    key: "team",
    label: "Team Brain",
    owns: "Internal communication",
    routes: ["/team"],
    purpose: "Coordinate team chat, handoffs, resources, and internal alerts.",
  },
] as const;

export const CANONICAL_JARVIS_TOOLS = [
  "web_search",
  "scrape_url",
  "update_instruction",
  "log_learning",
  "lookup_equipment",
  "verify_address",
  "send_sms_to_employee",
  "send_tech_form_link",
  "search_sms_history",
  "search_call_history",
  "read_team_messages",
  "send_team_message",
  "create_quote",
  "generate_install_quote",
  "convert_estimate_to_job",
  "generate_letterhead_document",
  "get_travel_times",
  "check_scheduling_fit",
  "suggest_schedule_optimization",
  "search_customer",
  "create_customer",
  "update_customer",
  "create_job",
  "invoke_repair_quote",
  "invoke_supplyhouse",
  "invoke_carrier_enterprise",
  "invoke_invoicing",
  "update_job_field",
  "create_parts_order",
  "update_warranty_status",
  "get_live_transcript",
  "suggest_actions",
  "move_photos_to_job",
] as const;

export const RETIRED_JARVIS_TOOLS = [
  "send_brochure_email",
  "read_email_thread",
  "search_emails",
  "extract_email_attachment",
  "create_vendor",
  "search_vendor",
  "get_workflow_status",
  "order_from_supplyhouse",
  "order_from_carrier_enterprise",
  "search_supplyhouse",
  "search_carrier_enterprise",
  "ahri_lookup_carrier_enterprise",
  "read_chat_messages",
  "send_chat_message",
] as const;

const canonicalToolSet = new Set<string>(CANONICAL_JARVIS_TOOLS);
const retiredToolSet = new Set<string>(RETIRED_JARVIS_TOOLS);

export function isCanonicalJarvisTool(functionName: string) {
  return canonicalToolSet.has(functionName);
}

export function isRetiredJarvisTool(functionName: string) {
  return retiredToolSet.has(functionName);
}
