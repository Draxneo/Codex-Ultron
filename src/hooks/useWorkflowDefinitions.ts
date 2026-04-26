import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StepOwner = "office" | "tech" | "customer" | "system";

export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  icon: string;
  automations: string[];
  primary_action: string;
  sort_order: number;
  notes: string[];
  integrations: string[];
  /** Maps to a column on the jobs table — null means check via completion_check logic */
  timestamp_field: string | null;
  /** How to determine if this step is complete */
  completion_check: "timestamp" | "status" | "field_set";
  /** For field_set checks, which field and expected value */
  field_check?: { field: string; value?: string };
  /** Conditional skip — step auto-completes when condition is met */
  skip_when?: { field: string; value?: string | boolean; not_value?: string | boolean };
  /** Position on the visual workflow canvas (auto-calculated from sort_order if missing) */
  position?: { x: number; y: number };
  /** Which tech form step_group sections are filled out during this step */
  form_sections?: string[];
  /** Who is responsible for this step — drives handoff notifications */
  owner?: StepOwner;
  /** Whether AI can auto-complete this step without human intervention */
  auto_completable?: boolean;
  /** What triggers auto-completion — describes the condition for the autopilot chain */
  auto_complete_condition?: string;
  /** External links/portals needed to complete this step — rendered as action buttons */
  action_links?: ActionLink[];

  /* ── Deterministic Execution Config ── */
  /** Slug referencing sms_templates or email_templates table — used by the generic runner */
  message_template?: string;
  /** Job fields that must be non-null before this step can auto-execute */
  required_fields?: string[];
  /** Who receives the template message */
  recipient_type?: "customer" | "tech" | "owner";
  /** Scheduling config for deferred sends (e.g. day-before reminders) */
  scheduling?: { relative_to: string; offset_days: number; time: string };
  /** What happens if required_fields are missing — defaults to "block_chain" */
  fallback_behavior?: "stamp_and_log" | "block_chain" | "escalate";
  /** If false, the workflow engine skips past this step even if incomplete (parallel track) */
  blocking?: boolean;
}

export interface ActionLink {
  label: string;
  /** Static URL or special tokens: {{warranty_portal}}, {{permit_portal}}, {{inspection_portal}}, {{cps_rebate}}, {{synchrony}}, {{supply_house}} */
  url: string;
  /** How to open: 'new_tab' opens in browser, 'panel' shows inline info panel */
  type: "new_tab" | "panel";
  /** Icon name from lucide */
  icon?: string;
}

export interface WorkflowDefinition {
  id: string;
  job_type: string;
  steps: WorkflowStep[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ═══════════════════════════════════════════════════════
   DEFAULT INSTALL WORKFLOW — 20 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_INSTALL_STEPS: WorkflowStep[] = [
  { id: "order_equipment", label: "Order Equipment & Check Availability", description: "Order equipment from supplier and confirm delivery lead time", icon: "package", automations: [], primary_action: "order_equipment", sort_order: 0, timestamp_field: "equipment_ordered_at", completion_check: "timestamp", owner: "office", auto_completable: false, notes: ["Verify selected equipment is in stock at supplier", "Place order via SupplyHouse or Carrier Enterprise portal", "Confirm estimated delivery date before scheduling install", "Links to parts_orders table for tracking"], integrations: ["supplyhouse-agent", "carrier-enterprise-agent"], action_links: [{ label: "Open SupplyHouse", url: "https://www.supplyhouse.com", type: "new_tab", icon: "external-link" }, { label: "Open Carrier Enterprise", url: "https://www.carrierenterprise.com", type: "new_tab", icon: "external-link" }] },
  { id: "schedule", label: "Schedule Install Date", description: "Pick a date for the install job", icon: "calendar", automations: ["send_reminder"], primary_action: "schedule", sort_order: 1, timestamp_field: "scheduled_date", completion_check: "field_set", field_check: { field: "scheduled_date" }, owner: "office", auto_completable: true, auto_complete_condition: "HCP webhook provides scheduled_date", notes: ["Job synced via webhook with customer info + address", "Job type auto-detected as 'install' from brand/tonnage or keywords", "Install task templates auto-attached (pre-job + post-job tasks)", "Chat thread auto-created: #JOB-{number}"], integrations: ["Webhook sync", "Property lookup"] },
  { id: "assign", label: "Assign Installer Crew", description: "Choose which installer crew to send", icon: "user", automations: [], primary_action: "assign", sort_order: 2, timestamp_field: "assigned_to", completion_check: "field_set", field_check: { field: "assigned_to" }, owner: "office", auto_completable: true, auto_complete_condition: "Auto-assign rules engine matches job_type to default crew", notes: ["Assigned to INSTALLER CREW (different people than the sales tech)", "Pre-job tasks begin once crew is assigned"], integrations: [] },
  { id: "lookup_jurisdiction", label: "Lookup Jurisdiction", description: "Identify which city/county has permit authority for this address", icon: "map-pin", automations: ["lookup-jurisdiction"], primary_action: "lookup_jurisdiction", sort_order: 3, timestamp_field: "jurisdiction_looked_up_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Firecrawl scrapes randymajors.org for jurisdiction data", notes: ["Uses Firecrawl to scrape randymajors.org city-limits map", "Stores jurisdiction name on job record", "Auto-matches to permit_authorities table if entry exists"], integrations: ["Firecrawl", "randymajors.org"] },
  { id: "pull_permit", label: "Pull Permit / Mark Not Needed", description: "Pull the building permit or mark as not required for this jurisdiction", icon: "building-2", automations: [], primary_action: "pull_permit", sort_order: 4, timestamp_field: "permit_pulled_at", completion_check: "timestamp", owner: "office", blocking: false, notes: ["NON-BLOCKING — workflow continues while permit is pending", "Each jurisdiction has different turnaround times", "Override creates a Mission Control alert so nothing falls through", "Smart Clipboard shows jurisdiction + authority data"], integrations: [], action_links: [{ label: "Open Permit Portal", url: "{{permit_portal}}", type: "new_tab", icon: "external-link" }] },
  { id: "deposit", label: "Collect Deposit via Stripe", description: "Send Stripe deposit link to customer", icon: "credit-card", automations: [], primary_action: "collect_deposit", sort_order: 5, timestamp_field: "deposit_paid_at", completion_check: "timestamp", skip_when: { field: "payment_method", value: "financed" }, owner: "customer", notes: ["Deposit required before dispatching on installs", "Stripe checkout link generated and shared with customer", "Webhook stamps deposit_paid_at when payment received", "AUTO-SKIPPED for financed jobs — no deposit needed"], integrations: ["Stripe checkout"] },
  { id: "finance_paperwork", label: "Complete Finance Paperwork", description: "Collect DocuSign email & applicant DOB, confirm paperwork signed", icon: "file-text", automations: [], primary_action: "complete_finance_paperwork", sort_order: 6, timestamp_field: "finance_paperwork_at", completion_check: "timestamp", skip_when: { field: "payment_method", not_value: "financed" }, owner: "office", notes: ["Requires a valid email address the customer can use for DocuSign", "Requires the birthday of the person who filled out the financing application", "Must be completed before the job can be dispatched to installers", "AUTO-SKIPPED for non-financed jobs"], integrations: ["DocuSign"], action_links: [{ label: "Open Financing Portal", url: "{{financing_portal}}", type: "new_tab", icon: "external-link" }] },
  { id: "confirmation", label: "Text Customer Appointment Reminder", description: "Day-before reminder confirming the appointment", icon: "message-square", automations: ["send_reminder"], primary_action: "send_confirmation", sort_order: 7, timestamp_field: "confirmation_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Scheduled automation sends day-before reminder", notes: ["Confirms date, time window, and what to expect", "Can be triggered manually or via scheduled automation"], integrations: ["Twilio SMS"], message_template: "appointment_confirmation", required_fields: ["customer_phone", "scheduled_date"], recipient_type: "customer", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "08:00" }, fallback_behavior: "block_chain" },
  { id: "install_checklist", label: "Send Install Checklist to Installer", description: "Installer fills out checklist — before photos, existing equipment info", icon: "clipboard-list", automations: ["send_install_checklist_sms"], primary_action: "send_install_checklist", sort_order: 8, timestamp_field: "preinstall_sent_at", completion_check: "timestamp", owner: "tech", form_sections: ["pickup", "before"], notes: ["Install Checklist sent to the INSTALLER (not the customer)", "Captures: before photos, old equipment data plates, workspace access notes", "AI extracts serial/model from data plate photos automatically"], integrations: ["Twilio SMS", "extract-equipment-photo (AI vision)"] },
  { id: "dispatch", label: "Text Job Details to Installer", description: "Send job details + address to the installers", icon: "truck", automations: ["send_dispatch_sms"], primary_action: "dispatch", sort_order: 9, timestamp_field: "dispatch_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-dispatch at 4PM day before scheduled date", notes: ["Dispatch SMS sent to lead installer with job details + address", "Office verifies all pre-job tasks complete before dispatching"], integrations: ["Twilio SMS"], message_template: "tech_dispatch", required_fields: ["assigned_to", "scheduled_date", "customer_phone"], recipient_type: "tech", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "16:00" }, fallback_behavior: "block_chain" },
  { id: "eta", label: "Text ETA to Customer", description: "Send on-my-way message with arrival time", icon: "map-pin", automations: ["send_eta_sms"], primary_action: "send_eta", sort_order: 10, timestamp_field: "on_my_way_sent_at", completion_check: "timestamp", owner: "tech", notes: ["Customer receives SMS with estimated arrival window", "Travel time calculated from tech's home address to job site"], integrations: ["Twilio SMS", "calculate-travel-times"] },
  { id: "in_progress", label: "Mark Crew On-Site", description: "Crew is on-site, work has started", icon: "play", automations: [], primary_action: "mark_in_progress", sort_order: 11, timestamp_field: null, completion_check: "status", field_check: { field: "status", value: "in_progress" }, owner: "tech", notes: ["Sets status to in_progress, tracks actual start time"], integrations: [] },
  { id: "completion_form", label: "Send Install Completion Checklist", description: "Installer fills out completion checklist — after photos, new equipment info", icon: "file-text", automations: ["send_completion_form"], primary_action: "send_form", sort_order: 12, timestamp_field: "completion_form_sent_at", completion_check: "timestamp", owner: "tech", form_sections: ["specs", "after", "completion"], notes: ["Captures: after photos, new equipment data plates, completion notes", "Equipment data reconciled into job_equipment table automatically", "Auto-completes related tasks"], integrations: ["extract-invoice (AI vision)", "reconcile-equipment"] },
  { id: "photos", label: "Confirm Photos Uploaded", description: "Verify final install photos are in the system", icon: "camera", automations: [], primary_action: "confirm_photos", sort_order: 13, timestamp_field: "photos_uploaded_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Check tech_form_photos count > 0 after form submission", notes: ["Explicit checkpoint — verifies before/after photos exist in job-photos bucket"], integrations: [] },
  { id: "invoice", label: "Send Invoice to Customer", description: "Create and send final invoice to customer", icon: "file-check", automations: [], primary_action: "send_invoice", sort_order: 14, timestamp_field: "invoice_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-generate invoice from line items and send via Stripe", notes: ["Stripe checkout link for remaining balance (minus deposit)", "Invoice auto-generated with line items from job data"], integrations: ["Stripe checkout"] },
  { id: "payment", label: "Confirm Payment Received", description: "Customer has paid the invoice", icon: "dollar-sign", automations: [], primary_action: "mark_paid", sort_order: 15, timestamp_field: "payment_collected_at", completion_check: "timestamp", owner: "customer", notes: ["Separate from invoice sent — tracks both halves", "Stripe webhook auto-stamps on successful payment"], integrations: ["Stripe webhook"] },
  { id: "review", label: "Text Google Review Link", description: "Text Google review request to customer", icon: "star", automations: ["send_review_request"], primary_action: "request_review", sort_order: 16, timestamp_field: "review_request_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-send after payment confirmed", notes: ["Google review request sent after all critical tasks complete", "SMS with direct link to Google review page"], integrations: ["send-review-request edge function"] },
  { id: "warranty", label: "Register Warranty", description: "Register new equipment with manufacturer", icon: "shield", automations: [], primary_action: "register_warranty", sort_order: 17, timestamp_field: "warranty_registered_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Trigger scout-warranty-portal browser automation", notes: ["Warranty auto-registration attempted via scout-warranty-portal", "Manual fallback if browser automation fails", "REQUIRED — must be done within 60 days of install"], integrations: ["scout-warranty-portal (browser automation)"], action_links: [{ label: "Open Warranty Portal", url: "{{warranty_portal}}", type: "new_tab", icon: "external-link" }] },
  { id: "rebate", label: "Submit CPS Rebate", description: "Generate and submit CPS rebate form", icon: "receipt", automations: [], primary_action: "submit_rebate", sort_order: 18, timestamp_field: "rebate_submitted_at", completion_check: "timestamp", skip_when: { field: "rebate_eligible", not_value: true }, owner: "office", notes: ["CPS rebate form generated from job + equipment data", "Emailed to CPS and customer for signature", "AUTO-SKIPPED if rebate_eligible is false"], integrations: ["send-rebate-email (Mailgun)"], action_links: [{ label: "Open CPS Rebate Portal", url: "https://www.cpsenergy.com/en/my-home/savenow/rebates-incentives.html", type: "new_tab", icon: "external-link" }] },
  { id: "inspection_schedule", label: "Schedule City Inspection", description: "Schedule the city/county inspection", icon: "calendar-check", automations: [], primary_action: "schedule_inspection", sort_order: 19, timestamp_field: "inspection_scheduled_at", completion_check: "timestamp", skip_when: { field: "permit_required", value: false }, owner: "office", notes: ["City inspection REQUIRED for installs (unless permit_required = false)", "AUTO-SKIPPED for no-permit jobs (like-for-like in some jurisdictions)"], integrations: [], action_links: [{ label: "Open Permit Portal", url: "{{permit_portal}}", type: "new_tab", icon: "external-link" }] },
  { id: "inspection_pass", label: "Mark Inspection Passed", description: "Inspection passed — close out permit", icon: "check-square", automations: [], primary_action: "mark_inspection_passed", sort_order: 20, timestamp_field: "inspection_passed_at", completion_check: "timestamp", skip_when: { field: "permit_required", value: false }, owner: "office", notes: ["Separate from scheduling — may need re-inspection if failed", "AUTO-SKIPPED for no-permit jobs"], integrations: [], action_links: [{ label: "Open Inspection Portal", url: "{{inspection_portal}}", type: "new_tab", icon: "external-link" }] },
  { id: "follow_up", label: "7-Day Quality Check Text", description: "AI texts customer for quality check — escalates problems to you", icon: "phone", automations: [], primary_action: "complete_follow_up", sort_order: 21, timestamp_field: "follow_up_completed_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-text 7 days post-completion, AI parses reply", notes: ["AI sends quality check text instead of phone call", "Only escalates to owner if customer reports a problem", "Stamps follow_up_completed_at and marks job done"], integrations: ["auto-follow-up-text edge function"] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULT SERVICE WORKFLOW — 16 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_SERVICE_STEPS: WorkflowStep[] = [
  { id: "schedule", label: "Schedule Service Date", description: "Pick a date for the service call", icon: "calendar", automations: ["send_reminder"], primary_action: "schedule", sort_order: 0, timestamp_field: "scheduled_date", completion_check: "field_set", field_check: { field: "scheduled_date" }, owner: "office", auto_completable: true, auto_complete_condition: "HCP webhook provides scheduled_date", notes: ["Job comes in via webhook — no estimate step for most service calls"], integrations: ["Webhook sync"] },
  { id: "assign", label: "Assign Service Tech", description: "Choose which service tech to send", icon: "user", automations: [], primary_action: "assign", sort_order: 1, timestamp_field: "assigned_to", completion_check: "field_set", field_check: { field: "assigned_to" }, owner: "office", auto_completable: true, auto_complete_condition: "Auto-assign rules engine", notes: ["Service techs work solo (unlike install crews of 2-3)"], integrations: [] },
  { id: "confirmation", label: "Text Customer Appointment Reminder", description: "Confirm the appointment with customer", icon: "message-square", automations: ["send_reminder"], primary_action: "send_confirmation", sort_order: 2, timestamp_field: "confirmation_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Scheduled automation", notes: ["Day-before or same-day confirmation text"], integrations: ["Twilio SMS"], message_template: "appointment_confirmation", required_fields: ["customer_phone", "scheduled_date"], recipient_type: "customer", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "08:00" }, fallback_behavior: "block_chain" },
  { id: "dispatch", label: "Text Job Details to Tech", description: "Send job details to the tech", icon: "truck", automations: ["send_dispatch_sms"], primary_action: "dispatch", sort_order: 3, timestamp_field: "dispatch_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-dispatch at 4PM day before", notes: ["Dispatch SMS includes job details, address, and checklist link", "If parts_orders exist with status ready_for_pickup, supply house + PO auto-appended to SMS"], integrations: ["Twilio SMS"], message_template: "tech_dispatch", required_fields: ["assigned_to", "scheduled_date", "customer_phone"], recipient_type: "tech", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "16:00" }, fallback_behavior: "block_chain" },
  { id: "eta", label: "Text ETA to Customer", description: "Send on-my-way message", icon: "map-pin", automations: ["send_eta_sms"], primary_action: "send_eta", sort_order: 4, timestamp_field: "on_my_way_sent_at", completion_check: "timestamp", owner: "tech", notes: ["Customer receives SMS with estimated arrival window"], integrations: ["Twilio SMS"] },
  { id: "in_progress", label: "Mark Tech On-Site", description: "Tech is on-site", icon: "play", automations: [], primary_action: "mark_in_progress", sort_order: 5, timestamp_field: null, completion_check: "status", field_check: { field: "status", value: "in_progress" }, owner: "tech", notes: ["Sets status to in_progress"], integrations: [] },
  { id: "completion_form", label: "Send Service Checklist to Tech", description: "Tech fills out service checklist on-site", icon: "file-text", automations: ["send_completion_form"], primary_action: "send_form", sort_order: 6, timestamp_field: "completion_form_sent_at", completion_check: "timestamp", owner: "tech", form_sections: ["pickup", "discovery", "before", "diagnosis", "after", "completion"], notes: ["Captures: repair performed, parts used, after photos", "Discovery section guides tech through comfort assessment questions on arrival", "If parts_orders exist, pickup info auto-included in dispatch SMS"], integrations: [] },
  { id: "tech_proposal", label: "Tech Submits Repair Proposal", description: "Tech submits tiered repair pricing from the field", icon: "clipboard-list", automations: [], primary_action: "submit_tech_proposal", sort_order: 7, timestamp_field: "tech_proposal_at", completion_check: "timestamp", owner: "tech", skip_when: { field: "estimate_type", not_value: "service_repair" }, notes: ["Tech selects necessary/recommended/deluxe repair tiers with pricing", "Creates estimate_review record for admin approval", "AUTO-SKIPPED for non-repair service calls (simple fixes)"], integrations: [] },
  { id: "review_approve", label: "Review & Approve Repair Estimate", description: "Admin reviews tech's repair proposal and adjusts pricing", icon: "check-square", automations: [], primary_action: "review_repair_estimate", sort_order: 8, timestamp_field: null, completion_check: "field_set", field_check: { field: "repair_estimate_approved" }, owner: "office", skip_when: { field: "estimate_type", not_value: "service_repair" }, notes: ["Office reviews tech's repair tiers, adjusts pricing if needed", "Shows in Tech Proposal Queue", "AUTO-SKIPPED for non-repair service calls"], integrations: [] },
  { id: "send_repair_presentation", label: "Send Repair Estimate to Customer", description: "Send customer-facing repair presentation with tiers and payment options", icon: "book-open", automations: [], primary_action: "send_repair_presentation", sort_order: 9, timestamp_field: "presentation_sent_at", completion_check: "timestamp", owner: "office", skip_when: { field: "estimate_type", not_value: "service_repair" }, notes: ["Customer sees diagnosis + necessary/recommended/deluxe tiers", "15% cash/check/CC discount vs 0% financing", "Includes service agreement upsell", "AUTO-SKIPPED for non-repair service calls"], integrations: ["send-brochure-email (Mailgun)"] },
  { id: "photos", label: "Confirm Photos Uploaded", description: "Verify final photos are in the system", icon: "camera", automations: [], primary_action: "confirm_photos", sort_order: 10, timestamp_field: "photos_uploaded_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Check photo count after form submission", notes: ["Explicit checkpoint for photo documentation"], integrations: [] },
  { id: "invoice", label: "Send Invoice to Customer", description: "Create and send invoice to customer", icon: "file-check", automations: [], primary_action: "send_invoice", sort_order: 11, timestamp_field: "invoice_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-generate and send after photos confirmed", notes: ["Stripe checkout link for service charges", "Member pricing auto-applied if customer has active agreement"], integrations: ["Stripe checkout"] },
  { id: "payment", label: "Confirm Payment Received", description: "Customer has paid", icon: "dollar-sign", automations: [], primary_action: "mark_paid", sort_order: 12, timestamp_field: "payment_collected_at", completion_check: "timestamp", owner: "customer", notes: ["Stripe webhook auto-stamps on successful payment"], integrations: ["Stripe webhook"] },
  { id: "offer_agreement", label: "Offer Service Agreement", description: "Prompt to upsell maintenance agreement to customer", icon: "crown", automations: [], primary_action: "offer_agreement", sort_order: 13, timestamp_field: "agreement_offered_at", completion_check: "timestamp", owner: "office", skip_when: { field: "has_active_agreement", value: true }, notes: ["Show agreement upsell if customer doesn't have one", "Links to Agreements page to create enrollment", "AUTO-SKIPPED if customer already has an active agreement"], integrations: [] },
  { id: "review", label: "Text Google Review Link", description: "Text Google review request", icon: "star", automations: ["send_review_request"], primary_action: "request_review", sort_order: 14, timestamp_field: "review_request_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-send after payment", notes: ["SMS with direct link to Google review page"], integrations: ["send-review-request"] },
  { id: "follow_up", label: "Quality Check Text", description: "AI texts customer for quality check", icon: "phone", automations: [], primary_action: "complete_follow_up", sort_order: 15, timestamp_field: "follow_up_completed_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-text 7 days post-completion", notes: ["AI sends quality check text, escalates problems to owner"], integrations: ["auto-follow-up-text"] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULT MAINTENANCE WORKFLOW — 13 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_MAINTENANCE_STEPS: WorkflowStep[] = [
  { id: "schedule", label: "Schedule Tune-Up Date", description: "Pick a date for the maintenance visit", icon: "calendar", automations: ["send_reminder"], primary_action: "schedule", sort_order: 0, timestamp_field: "scheduled_date", completion_check: "field_set", field_check: { field: "scheduled_date" }, owner: "office", auto_completable: true, auto_complete_condition: "HCP webhook", notes: ["Maintenance visits tied to service agreements"], integrations: ["Webhook sync"] },
  { id: "assign", label: "Assign Tech", description: "Choose which tech to send", icon: "user", automations: [], primary_action: "assign", sort_order: 1, timestamp_field: "assigned_to", completion_check: "field_set", field_check: { field: "assigned_to" }, owner: "office", auto_completable: true, auto_complete_condition: "Auto-assign rules engine", notes: ["Same tech pool as service — they work solo"], integrations: [] },
  { id: "confirmation", label: "Text Customer Appointment Reminder", description: "Confirm the appointment", icon: "message-square", automations: ["send_reminder"], primary_action: "send_confirmation", sort_order: 2, timestamp_field: "confirmation_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Scheduled automation", notes: ["Day-before or same-day confirmation"], integrations: ["Twilio SMS"], message_template: "appointment_confirmation", required_fields: ["customer_phone", "scheduled_date"], recipient_type: "customer", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "08:00" }, fallback_behavior: "block_chain" },
  { id: "dispatch", label: "Text Job Details to Tech", description: "Send job details to the tech", icon: "truck", automations: ["send_dispatch_sms"], primary_action: "dispatch", sort_order: 3, timestamp_field: "dispatch_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-dispatch at 4PM day before", notes: ["Dispatch SMS with tune-up checklist link"], integrations: ["Twilio SMS"], message_template: "tech_dispatch", required_fields: ["assigned_to", "scheduled_date", "customer_phone"], recipient_type: "tech", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "16:00" }, fallback_behavior: "block_chain" },
  { id: "eta", label: "Text ETA to Customer", description: "Send on-my-way message", icon: "map-pin", automations: ["send_eta_sms"], primary_action: "send_eta", sort_order: 4, timestamp_field: "on_my_way_sent_at", completion_check: "timestamp", owner: "tech", notes: ["ETA text to customer"], integrations: ["Twilio SMS"] },
  { id: "in_progress", label: "Mark Tech On-Site", description: "Tech is on-site", icon: "play", automations: [], primary_action: "mark_in_progress", sort_order: 5, timestamp_field: null, completion_check: "status", field_check: { field: "status", value: "in_progress" }, owner: "tech", notes: ["Sets status to in_progress"], integrations: [] },
  { id: "completion_form", label: "Send Tune-Up Checklist to Tech", description: "Tech fills out tune-up checklist", icon: "file-text", automations: ["send_completion_form"], primary_action: "send_form", sort_order: 6, timestamp_field: "completion_form_sent_at", completion_check: "timestamp", owner: "tech", form_sections: ["discovery", "photos", "checklist", "diagnosis", "notes", "completion"], notes: ["Captures: pressure readings, temp splits, filter info, capacitor readings, safety checks, system operation"], integrations: [] },
  { id: "photos", label: "Confirm Photos Uploaded", description: "Verify photos are in the system", icon: "camera", automations: [], primary_action: "confirm_photos", sort_order: 7, timestamp_field: "photos_uploaded_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Check photo count after form submission", notes: ["Photo documentation of equipment condition"], integrations: [] },
  { id: "maint_report", label: "Email Maintenance Report to Customer", description: "Send written report to customer", icon: "file-bar-chart", automations: [], primary_action: "send_maint_report", sort_order: 8, timestamp_field: "maint_report_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "AI generates report from form data", notes: ["Maintenance customers expect a written report with findings and recommendations"], integrations: ["Mailgun"] },
  { id: "invoice", label: "Send Invoice to Customer", description: "Create and send invoice", icon: "file-check", automations: [], primary_action: "send_invoice", sort_order: 9, timestamp_field: "invoice_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-generate and send", notes: ["May be $0 if covered by agreement"], integrations: ["Stripe checkout"] },
  { id: "payment", label: "Confirm Payment Received", description: "Customer has paid", icon: "dollar-sign", automations: [], primary_action: "mark_paid", sort_order: 10, timestamp_field: "payment_collected_at", completion_check: "timestamp", owner: "customer", notes: ["Auto-stamped via Stripe webhook or manual mark"], integrations: ["Stripe webhook"] },
  { id: "review", label: "Text Google Review Link", description: "Text Google review request", icon: "star", automations: ["send_review_request"], primary_action: "request_review", sort_order: 11, timestamp_field: "review_request_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-send after payment", notes: ["SMS with Google review link"], integrations: ["send-review-request"] },
  { id: "next_visit", label: "Schedule Next Tune-Up Visit", description: "Book the next maintenance visit", icon: "calendar-plus", automations: [], primary_action: "schedule_next_visit", sort_order: 12, timestamp_field: "next_visit_scheduled_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Calculate from agreement frequency", notes: ["Closes the loop for agreement customers", "Auto-calculated from agreement frequency if applicable"], integrations: [] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULT ESTIMATE WORKFLOW — 10 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_ESTIMATE_STEPS: WorkflowStep[] = [
  { id: "schedule", label: "Schedule Estimate Visit", description: "Pick a date for the sales tech visit", icon: "calendar", automations: ["send_reminder"], primary_action: "schedule", sort_order: 0, timestamp_field: "scheduled_date", completion_check: "field_set", field_check: { field: "scheduled_date" }, owner: "office", notes: ["Lead source tracked, property card auto-loaded"], integrations: ["Webhook sync", "Property lookup"] },
  { id: "assign", label: "Assign Sales Tech", description: "Choose which sales tech to send", icon: "user", automations: [], primary_action: "assign", sort_order: 1, timestamp_field: "assigned_to", completion_check: "field_set", field_check: { field: "assigned_to" }, owner: "office", notes: ["Sales techs assess the home and recommend equipment — different from installers"], integrations: [] },
  { id: "confirmation", label: "Text Customer Appointment Reminder", description: "Confirm the estimate appointment", icon: "message-square", automations: ["send_reminder"], primary_action: "send_confirmation", sort_order: 2, timestamp_field: "confirmation_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Scheduled automation", notes: ["Confirms date/time and what to expect during the estimate visit"], integrations: ["Twilio SMS"], message_template: "appointment_confirmation", required_fields: ["customer_phone", "scheduled_date"], recipient_type: "customer", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "08:00" }, fallback_behavior: "block_chain" },
  { id: "dispatch", label: "Text Job Details to Sales Tech", description: "Send job details to the sales tech", icon: "truck", automations: ["send_dispatch_sms"], primary_action: "dispatch", sort_order: 3, timestamp_field: "dispatch_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-dispatch at 4PM day before", notes: ["Dispatch SMS with customer info and address"], integrations: ["Twilio SMS"], message_template: "tech_dispatch", required_fields: ["assigned_to", "scheduled_date", "customer_phone"], recipient_type: "tech", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "16:00" }, fallback_behavior: "block_chain" },
  { id: "eta", label: "Text ETA to Customer", description: "Send on-my-way message", icon: "map-pin", automations: ["send_eta_sms"], primary_action: "send_eta", sort_order: 4, timestamp_field: "on_my_way_sent_at", completion_check: "timestamp", owner: "tech", notes: ["ETA text to customer"], integrations: ["Twilio SMS"] },
  { id: "in_progress", label: "Mark Tech On-Site", description: "Sales tech is on-site doing assessment", icon: "play", automations: [], primary_action: "mark_in_progress", sort_order: 5, timestamp_field: null, completion_check: "status", field_check: { field: "status", value: "in_progress" }, owner: "tech", notes: ["Tech is on-site assessing existing equipment and home layout"], integrations: [] },
  { id: "tech_form", label: "Send Sales Checklist to Tech", description: "Sales checklist captures equipment info, photos, tier selections", icon: "file-text", automations: ["send_completion_form"], primary_action: "send_form", sort_order: 6, timestamp_field: "completion_form_sent_at", completion_check: "timestamp", owner: "tech", form_sections: ["discovery", "photos", "specs", "conditions", "notes"], notes: ["AI extracts serial/model from data plate photos", "Tech selects recommended tiers and captures before photos"], integrations: ["extract-equipment-photo (AI vision)"] },
  { id: "review_approve", label: "Review & Approve Estimate", description: "Office reviews tech recommendations, adjusts pricing", icon: "check-square", automations: [], primary_action: "review_estimate", sort_order: 7, timestamp_field: null, completion_check: "field_set", field_check: { field: "work_status", value: "approved" }, owner: "office", notes: ["Office reviews tech's recommendations, adjusts pricing formulas", "estimate_reviews table tracks approval status"], integrations: [] },
  { id: "send_presentation", label: "Send Sales Presentation", description: "Send interactive sales presentation with comparison blocks and financing", icon: "book-open", automations: [], primary_action: "send_presentation", sort_order: 8, timestamp_field: "presentation_sent_at", completion_check: "timestamp", owner: "office", notes: ["Interactive sales presentation with comparison blocks, financing options, and addon upsells", "Customer can approve, request changes, or decline directly from the presentation"], integrations: ["send-brochure-email (Mailgun)"] },
  { id: "won_lost", label: "Mark Won / Lost", description: "If won, auto-creates install job with all context", icon: "flag", automations: [], primary_action: "mark_won_lost", sort_order: 9, timestamp_field: null, completion_check: "field_set", field_check: { field: "work_status", value: "won" }, owner: "customer", notes: ["Won triggers createJobFromEstimate() — copies customer data, selected tiers, payment preference", "Auto-creates install job + chat channel + task templates", "Customer can approve directly from the sales presentation"], integrations: [] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULT CSR CALL FLOW — 10 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_CSR_STEPS: WorkflowStep[] = [
  { id: "intent_detect", label: "Intent Detection", description: "AI classifies inbound request: repair, maintenance, install/quote, or general", icon: "brain", automations: [], primary_action: "detect_intent", sort_order: 0, timestamp_field: null, completion_check: "field_set", field_check: { field: "detected_intent" }, owner: "system", auto_completable: true, auto_complete_condition: "AI classifies first message for SMS; manual select for phone", notes: ["Analyzes first message/call notes to classify: repair, maintenance, install_quote, general", "Pre-fills service_type to skip redundant questions", "SMS: automatic via AI. Phone: CSR selects from dropdown"], integrations: ["Lovable AI"] },
  { id: "customer_lookup", label: "Customer Lookup", description: "Check if caller/texter is already in the system", icon: "search", automations: [], primary_action: "lookup_customer", sort_order: 1, timestamp_field: null, completion_check: "field_set", field_check: { field: "customer_id" }, owner: "office", auto_completable: true, auto_complete_condition: "Phone number match via find_customer_by_phone RPC", notes: ["Auto-matches by phone number (last 10 digits)", "Found → greet by name, skip info collection", "Not found → proceed to collect info"], integrations: ["find_customer_by_phone RPC"] },
  { id: "collect_info", label: "Collect Customer Info", description: "Name, address, phone confirmation (new customers only)", icon: "user-plus", automations: [], primary_action: "collect_customer_info", sort_order: 2, timestamp_field: null, completion_check: "field_set", field_check: { field: "customer_info_collected" }, owner: "office", skip_when: { field: "customer_found", value: true }, notes: ["AUTO-SKIPPED for returning customers", "For SMS: AI detects name/address in earlier messages to pre-fill", "For phone: standard intake form", "Verify address with Google Places autocomplete"], integrations: ["Google geocoding"] },
  { id: "problem_request", label: "Problem / Request", description: "What do they need? (pre-filled from intent if obvious)", icon: "clipboard-list", automations: [], primary_action: "describe_problem", sort_order: 3, timestamp_field: null, completion_check: "field_set", field_check: { field: "problem_description" }, owner: "office", notes: ["Pre-filled from intent detection if the first message was clear", "repair → 'AC broken / not cooling / leaking'", "install_quote → 'pricing on new system'", "If general/unclear, CSR asks for details"], integrations: [] },
  { id: "route_department", label: "Route to Department", description: "Dispatch (service/maint) or Sales (install/quote)", icon: "git-branch", automations: [], primary_action: "route_department", sort_order: 4, timestamp_field: null, completion_check: "field_set", field_check: { field: "routed_department" }, owner: "system", auto_completable: true, auto_complete_condition: "Auto-routed from detected intent: repair/maint → Dispatch, install/quote → Sales", notes: ["repair/maintenance → 'Let me get this over to Dispatch'", "install/quote → 'Let me get this over to Sales'", "Warm handoff language: 'Let me get this to [Owner]'s desk'"], integrations: [] },
  { id: "business_hours_check", label: "Business Hours Check", description: "System determines time context for callback routing", icon: "clock", automations: [], primary_action: "check_hours", sort_order: 5, timestamp_field: null, completion_check: "field_set", field_check: { field: "time_context" }, owner: "system", auto_completable: true, auto_complete_condition: "Auto-check IVR config business hours + 10 PM CT gate", notes: ["During business hours → 'I'll get this right over to their desk!'", "After hours, before 10 PM → 'Would you prefer a call or text right away?'", "After 10 PM → 'They'll contact you first thing in the morning!'", "Uses ivr_config business_hours_start/end + America/Chicago timezone"], integrations: ["ivr_config"] },
  { id: "callback_pref", label: "Callback Preference", description: "Call vs text, confirm number", icon: "phone-forwarded", automations: [], primary_action: "capture_callback_pref", sort_order: 6, timestamp_field: null, completion_check: "field_set", field_check: { field: "callback_preference" }, owner: "office", skip_when: { field: "time_context", value: "after_10pm" }, notes: ["AUTO-SKIPPED after 10 PM — no preference needed, promise morning contact", "Asks: 'What's a good number to call you back on, or do you prefer text?'", "Confirms the phone number on file is correct"], integrations: [] },
  { id: "collect_time", label: "Preferred Time", description: "Department-specific availability windows for scheduling", icon: "clock", automations: [], primary_action: "collect_preferred_time", sort_order: 7, timestamp_field: null, completion_check: "field_set", field_check: { field: "preferred_time" }, owner: "office", skip_when: { field: "time_context", value: "after_10pm" }, notes: ["Service: Mon–Fri 8 AM – 5 PM, 2-hour blocks", "Sales: Mon–Sun 8 AM – 10 PM, Sunday 9–12 blocked (church)", "AI parses day + time and validates against department window", "Invalid times get a friendly retry with the correct hours"], integrations: ["Lovable AI"] },
  { id: "create_action", label: "Create Job / Action Item", description: "Book job or queue callback for follow-up", icon: "plus-circle", automations: [], primary_action: "create_job_or_action", sort_order: 8, timestamp_field: null, completion_check: "field_set", field_check: { field: "job_or_action_created" }, owner: "office", notes: ["Creates action_item with type: dispatch_callback or sales_callback", "Metadata: preferred_contact, phone, time_context, intent, initial_message", "Surfaces in Mission Control as amber card", "For phone intake: may create job directly if enough info"], integrations: [] },
  { id: "warm_close", label: "Warm Close", description: "Friendly signoff with owner/team name", icon: "heart", automations: [], primary_action: "warm_close", sort_order: 8, timestamp_field: null, completion_check: "field_set", field_check: { field: "closed" }, owner: "system", auto_completable: true, auto_complete_condition: "Auto-send after action item created", notes: ["'All set! [Owner] will be reaching out. Have a great [evening/day]!'", "Time-of-day aware greeting (morning/afternoon/evening)", "For SMS: auto-sent. For phone: CSR reads script"], integrations: [] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULT PHONE CALL WORKFLOW — 6 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_PHONE_CALL_STEPS: WorkflowStep[] = [
  { id: "schedule_call", label: "Schedule Call Time", description: "Pick a date and time for the phone call", icon: "calendar", automations: [], primary_action: "schedule", sort_order: 0, timestamp_field: "scheduled_date", completion_check: "field_set", field_check: { field: "scheduled_date" }, owner: "office", auto_completable: true, auto_complete_condition: "JARVIS sets scheduled_date from intake", notes: ["Set date + time for the callback or sales call", "Can be created from CSR intake or manually"], integrations: [] },
  { id: "assign_caller", label: "Assign Team Member", description: "Choose who will make the call", icon: "user", automations: [], primary_action: "assign", sort_order: 1, timestamp_field: "assigned_to", completion_check: "field_set", field_check: { field: "assigned_to" }, owner: "office", auto_completable: true, auto_complete_condition: "Auto-assign rules engine", notes: ["Route to sales or dispatch based on intent"], integrations: [] },
  { id: "text_reminder", label: "Text Reminder to Customer", description: "Day-of reminder that the call is coming", icon: "message-square", automations: ["send_reminder"], primary_action: "send_confirmation", sort_order: 2, timestamp_field: "confirmation_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Scheduled automation sends day-of reminder", notes: ["'Hi [name], just a heads-up — we'll be calling you today around [time]'"], integrations: ["Twilio SMS"], message_template: "call_reminder", required_fields: ["customer_phone", "scheduled_date"], recipient_type: "customer", scheduling: { relative_to: "scheduled_date", offset_days: 0, time: "08:00" }, fallback_behavior: "block_chain" },
  { id: "make_call", label: "Make the Call", description: "Mark that the call is in progress", icon: "phone", automations: [], primary_action: "mark_in_progress", sort_order: 3, timestamp_field: null, completion_check: "status", field_check: { field: "status", value: "in_progress" }, owner: "tech", notes: ["Sets status to in_progress when the call starts"], integrations: [] },
  { id: "log_outcome", label: "Log Outcome / Notes", description: "Record what happened on the call", icon: "clipboard-list", automations: [], primary_action: "log_outcome", sort_order: 4, timestamp_field: "completion_form_sent_at", completion_check: "timestamp", owner: "office", notes: ["Document call result: answered, voicemail, rescheduled, converted", "Add notes for follow-up context"], integrations: [] },
  { id: "create_followup", label: "Create Follow-Up", description: "If needed, create a new job or estimate from the call", icon: "calendar-plus", automations: [], primary_action: "create_followup", sort_order: 5, timestamp_field: "follow_up_completed_at", completion_check: "timestamp", owner: "office", notes: ["Convert to service job, install estimate, or schedule another call", "Links back to original phone call job for history"], integrations: [] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULT CSR SMS FLOW — 12 STEPS
   Mirrors handleIntakeSession.ts state machine
   ═══════════════════════════════════════════════════════ */

const DEFAULT_CSR_SMS_STEPS: WorkflowStep[] = [
  { id: "sms_intent_detect", label: "Intent Detection", description: "AI classifies first inbound SMS: repair, maintenance, install_quote, or general", icon: "brain", automations: [], primary_action: "detect_intent", sort_order: 0, timestamp_field: null, completion_check: "field_set", field_check: { field: "detected_intent" }, owner: "system", auto_completable: true, auto_complete_condition: "AI extraction from first message text", notes: ["Parses first SMS for keywords: 'AC broken' → repair, 'new system' → install_quote", "Sets service_type on session to skip redundant questions downstream", "Confidence logged in debug trace"], integrations: ["Lovable AI"] },
  { id: "sms_customer_lookup", label: "Customer Lookup (Fuzzy Match)", description: "Phone number match + fuzzy name search against customer database", icon: "search", automations: [], primary_action: "lookup_customer", sort_order: 1, timestamp_field: null, completion_check: "field_set", field_check: { field: "customer_id" }, owner: "system", auto_completable: true, auto_complete_condition: "fuzzyMatchCustomerName() — phone + name matching", notes: ["First tries exact phone match (last 10 digits)", "Then fuzzy name match if AI extracted a name from the message", "Found → greet by first name, skip name/address collection", "Not found → proceed to collect_name"], integrations: ["find_customer_by_phone RPC"] },
  { id: "sms_collect_name", label: "Collect Name", description: "Ask for customer's name if not detected from message or phone lookup", icon: "user-plus", automations: [], primary_action: "collect_name", sort_order: 2, timestamp_field: null, completion_check: "field_set", field_check: { field: "customer_name" }, owner: "system", skip_when: { field: "customer_found", value: true }, notes: ["AUTO-SKIPPED for returning customers (fuzzy match hit)", "AI tries to extract name from initial message first", "If not found, JARVIS asks: 'What's your name so I can look you up?'"], integrations: [] },
  { id: "sms_collect_address", label: "Collect Address", description: "Ask for street address — raw text input from customer", icon: "map", automations: [], primary_action: "collect_address", sort_order: 3, timestamp_field: null, completion_check: "field_set", field_check: { field: "raw_address" }, owner: "system", skip_when: { field: "customer_found", value: true }, notes: ["AUTO-SKIPPED for returning customers with address on file", "Accepts freeform text — Mapbox verification happens next", "JARVIS: 'And what's your address so we can get you on the schedule?'"], integrations: [] },
  { id: "sms_verify_address", label: "Verify Address (Mapbox)", description: "Geocode raw address with SA proximity bias, calculate service area tier", icon: "map-pin", automations: [], primary_action: "verify_address", sort_order: 4, timestamp_field: null, completion_check: "field_set", field_check: { field: "verified_address" }, owner: "system", auto_completable: true, auto_complete_condition: "verifyAddressMapbox() with proximity=-98.4936,29.4241", notes: ["Biased to San Antonio metro area results", "Calculates distance from SA center (29.4241, -98.4936)", "0–10 mi: Priority zone | 10–30 mi: Normal | 30–50 mi: Extended", "50+ mi: Outside service area — JARVIS notes it", "Confidence > 0.7 → auto-proceed to confirm"], integrations: ["Mapbox Geocoding API"] },
  { id: "sms_confirm_address", label: "Confirm Address", description: "JARVIS reads back standardized address for customer confirmation", icon: "check-circle", automations: [], primary_action: "confirm_address", sort_order: 5, timestamp_field: null, completion_check: "field_set", field_check: { field: "address_confirmed" }, owner: "system", notes: ["'Just to make sure — is your address 1234 Main St, San Antonio TX 78201? 📍'", "Customer replies yes/no", "No → collect_address_retry (ask again)", "Yes → proceed to routing"], integrations: [] },
  { id: "sms_route_department", label: "Route to Department", description: "Service vs Sales routing based on detected intent", icon: "git-branch", automations: [], primary_action: "route_department", sort_order: 6, timestamp_field: null, completion_check: "field_set", field_check: { field: "routed_department" }, owner: "system", auto_completable: true, auto_complete_condition: "Auto-routed from intent: repair/maint → Dispatch, install_quote → Sales", notes: ["repair/maintenance → Dispatch (creates action_item)", "install_quote → Sales (creates phone_call job on owner's board)", "Warm handoff: 'Let me get this over to [department]'"], integrations: [] },
  { id: "sms_hours_check", label: "Business Hours Check", description: "Time-aware routing — determines callback timing", icon: "clock", automations: [], primary_action: "check_hours", sort_order: 7, timestamp_field: null, completion_check: "field_set", field_check: { field: "time_context" }, owner: "system", auto_completable: true, auto_complete_condition: "Check IVR config hours + 10 PM CT gate", notes: ["During business hours → immediate callback promise", "After hours, before 10 PM → capture call/text preference", "After 10 PM → promise morning contact, skip preference capture", "Uses America/Chicago timezone"], integrations: ["ivr_config"] },
  { id: "sms_callback_pref", label: "Callback Preference", description: "Call vs text — skipped after 10 PM", icon: "phone-forwarded", automations: [], primary_action: "capture_callback_pref", sort_order: 8, timestamp_field: null, completion_check: "field_set", field_check: { field: "callback_preference" }, owner: "system", skip_when: { field: "time_context", value: "after_10pm" }, notes: ["AUTO-SKIPPED after 10 PM — no preference needed", "'Would you prefer a call back or a text?'", "Validates response is call/text/either"], integrations: [] },
  { id: "sms_preferred_time", label: "Preferred Time", description: "Department-specific time windows", icon: "calendar-clock", automations: [], primary_action: "collect_preferred_time", sort_order: 9, timestamp_field: null, completion_check: "field_set", field_check: { field: "preferred_time" }, owner: "system", skip_when: { field: "time_context", value: "after_10pm" }, notes: ["Service: Mon–Fri 8 AM – 5 PM, 2-hour blocks", "Sales: Mon–Sun 8 AM – 10 PM, Sunday 9–12 blocked (church)", "AI parses freeform time and validates against department window", "Invalid times get friendly retry: 'Our service team is available Mon–Fri 8–5, when works best?'"], integrations: ["Lovable AI"] },
  { id: "sms_create_action", label: "Create Job / Action Item", description: "Books phone_call job (Sales) or action_item (Service) for dispatcher", icon: "plus-circle", automations: [], primary_action: "create_job_or_action", sort_order: 10, timestamp_field: null, completion_check: "field_set", field_check: { field: "job_or_action_created" }, owner: "system", auto_completable: true, auto_complete_condition: "Auto-creates based on routed department", notes: ["Sales → phone_call job on owner's dispatch board (unlimited slots)", "Service → action_item in Mission Control (dispatch_callback)", "Metadata includes: intent, service_area_tier, distance_from_sa, preferred_time, callback_pref", "Surfaces as amber card in Mission Control for dispatcher confirmation"], integrations: [] },
  { id: "sms_warm_close", label: "Warm Close", description: "Friendly signoff with owner/team name — time-of-day aware", icon: "heart", automations: [], primary_action: "warm_close", sort_order: 11, timestamp_field: null, completion_check: "field_set", field_check: { field: "closed" }, owner: "system", auto_completable: true, auto_complete_condition: "Auto-send after job/action created", notes: ["'All set! Clint will be reaching out. Have a great evening! 🤙'", "Time-of-day aware: morning/afternoon/evening", "Includes owner name for personal touch", "Session marked complete — expires after 2 hours for fresh start"], integrations: [] },
];

/* ═══════════════════════════════════════════════════════
   DEFAULTS MAP
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   DEFAULT DUCTWORK WORKFLOW — 12 STEPS
   ═══════════════════════════════════════════════════════ */

const DEFAULT_DUCTWORK_STEPS: WorkflowStep[] = [
  { id: "schedule", label: "Schedule Duct Work Date", description: "Pick a date for the ductwork replacement", icon: "calendar", automations: ["send_reminder"], primary_action: "schedule", sort_order: 0, timestamp_field: "scheduled_date", completion_check: "field_set", field_check: { field: "scheduled_date" }, owner: "office", auto_completable: true, auto_complete_condition: "HCP webhook provides scheduled_date", notes: [], integrations: [] },
  { id: "assign", label: "Assign Installer Crew", description: "Choose which installer crew to send", icon: "user", automations: [], primary_action: "assign", sort_order: 1, timestamp_field: "assigned_to", completion_check: "field_set", field_check: { field: "assigned_to" }, owner: "office", auto_completable: true, auto_complete_condition: "Auto-assign rules engine", notes: [], integrations: [] },
  { id: "confirmation", label: "Text Customer Appointment Reminder", description: "Confirm the appointment with customer", icon: "message-square", automations: ["send_reminder"], primary_action: "send_confirmation", sort_order: 2, timestamp_field: "confirmation_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Scheduled automation", notes: [], integrations: ["Twilio SMS"], message_template: "appointment_confirmation", required_fields: ["customer_phone", "scheduled_date"], recipient_type: "customer", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "08:00" }, fallback_behavior: "block_chain" },
  { id: "dispatch", label: "Text Job Details to Installer", description: "Send job details to the installer crew", icon: "truck", automations: ["send_dispatch_sms"], primary_action: "dispatch", sort_order: 3, timestamp_field: "dispatch_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-dispatch at 4PM day before", notes: [], integrations: ["Twilio SMS"], message_template: "tech_dispatch", required_fields: ["assigned_to", "scheduled_date", "customer_phone"], recipient_type: "tech", scheduling: { relative_to: "scheduled_date", offset_days: -1, time: "16:00" }, fallback_behavior: "block_chain" },
  { id: "eta", label: "Text ETA to Customer", description: "Send on-my-way message with arrival time", icon: "map-pin", automations: ["send_eta_sms"], primary_action: "send_eta", sort_order: 4, timestamp_field: "on_my_way_sent_at", completion_check: "timestamp", owner: "tech", notes: [], integrations: ["Twilio SMS"] },
  { id: "in_progress", label: "Mark Crew On-Site", description: "Crew is on-site, work has started", icon: "play", automations: [], primary_action: "mark_in_progress", sort_order: 5, timestamp_field: null, completion_check: "status", field_check: { field: "status", value: "in_progress" }, owner: "tech", notes: [], integrations: [] },
  { id: "completion_form", label: "Send Duct Work Checklist", description: "Installer fills out duct work checklist — duct photos, conditions, after photos", icon: "file-text", automations: ["send_completion_form"], primary_action: "send_form", sort_order: 6, timestamp_field: "completion_form_sent_at", completion_check: "timestamp", owner: "tech", form_sections: ["arrival", "duct_photos", "conditions", "notes", "completion"], notes: ["Captures existing duct photos, site conditions, after photos", "No equipment data plate fields — ductwork only"], integrations: [] },
  { id: "photos", label: "Confirm Photos Uploaded", description: "Verify duct photos are in the system", icon: "camera", automations: [], primary_action: "confirm_photos", sort_order: 7, timestamp_field: "photos_uploaded_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Check photo count after form submission", notes: [], integrations: [] },
  { id: "invoice", label: "Send Invoice to Customer", description: "Create and send final invoice", icon: "file-check", automations: [], primary_action: "send_invoice", sort_order: 8, timestamp_field: "invoice_sent_at", completion_check: "timestamp", owner: "office", auto_completable: true, auto_complete_condition: "Auto-generate invoice from line items", notes: [], integrations: ["Stripe checkout"] },
  { id: "payment", label: "Confirm Payment Received", description: "Customer has paid the invoice", icon: "dollar-sign", automations: [], primary_action: "mark_paid", sort_order: 9, timestamp_field: "payment_collected_at", completion_check: "timestamp", owner: "customer", notes: [], integrations: ["Stripe webhook"] },
  { id: "review", label: "Text Google Review Link", description: "Text Google review request to customer", icon: "star", automations: ["send_review_request"], primary_action: "request_review", sort_order: 10, timestamp_field: "review_request_sent_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-send after payment confirmed", notes: [], integrations: [] },
  { id: "follow_up", label: "7-Day Quality Check Text", description: "AI texts customer for quality check", icon: "phone", automations: [], primary_action: "complete_follow_up", sort_order: 11, timestamp_field: "follow_up_completed_at", completion_check: "timestamp", owner: "system", auto_completable: true, auto_complete_condition: "Auto-text 7 days post-completion", notes: [], integrations: [] },
];

const DEFAULTS: Record<string, WorkflowStep[]> = {
  install: DEFAULT_INSTALL_STEPS,
  service: DEFAULT_SERVICE_STEPS,
  maintenance: DEFAULT_MAINTENANCE_STEPS,
  estimate: DEFAULT_ESTIMATE_STEPS,
  csr: DEFAULT_CSR_STEPS,
  phone_call: DEFAULT_PHONE_CALL_STEPS,
  csr_sms: DEFAULT_CSR_SMS_STEPS,
  ductwork: DEFAULT_DUCTWORK_STEPS,
};

/** Get the default steps for a given job type — used as fallback when DB has no definition */
const ESTIMATE_SUBTYPES = ["system_replacement", "service_repair", "new_construction", "ductwork"];

export function getDefaultSteps(jobType: string): WorkflowStep[] {
  const normalized = ESTIMATE_SUBTYPES.includes(jobType) ? "estimate" : jobType;
  return DEFAULTS[normalized] || DEFAULTS.service;
}

/** Lookup default form_sections for a step by id, searching across all job types or a specific one */
export function getDefaultFormSections(stepId: string, jobType?: string): string[] {
  const normalizedType = jobType && ESTIMATE_SUBTYPES.includes(jobType) ? "estimate" : jobType;
  const sources = normalizedType ? [DEFAULTS[normalizedType] || []] : Object.values(DEFAULTS);
  for (const steps of sources) {
    const step = steps.find(s => s.id === stepId);
    if (step?.form_sections?.length) return step.form_sections;
  }
  return [];
}

export function useWorkflowDefinitions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["workflow_definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_definitions" as any)
        .select("*")
        .order("job_type");
      if (error) throw error;
      return (data || []) as unknown as WorkflowDefinition[];
    },
  });

  const seedIfEmpty = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from("workflow_definitions" as any)
        .select("id, job_type")
        .limit(10);

      if (!existing || existing.length === 0) {
        // No rows at all — seed everything
        const rows = Object.entries(DEFAULTS).map(([job_type, steps]) => ({
          job_type,
          steps: JSON.stringify(steps),
          is_active: true,
        }));
        const { error } = await supabase
          .from("workflow_definitions" as any)
          .insert(rows as any);
        if (error) throw error;
      } else {
        // Check for missing job types and insert them
        const existingTypes = new Set((existing as any[]).map((r: any) => r.job_type));
        const missing = Object.entries(DEFAULTS).filter(([jt]) => !existingTypes.has(jt));
        if (missing.length > 0) {
          const rows = missing.map(([job_type, steps]) => ({
            job_type,
            steps: JSON.stringify(steps),
            is_active: true,
          }));
          const { error } = await supabase
            .from("workflow_definitions" as any)
            .insert(rows as any);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow_definitions"] }),
  });

  const updateWorkflow = useMutation({
    mutationFn: async ({ id, steps }: { id: string; steps: WorkflowStep[] }) => {
      const { error } = await supabase
        .from("workflow_definitions" as any)
        .update({ steps: JSON.stringify(steps), updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow_definitions"] }),
  });

  const reseedWorkflow = useMutation({
    mutationFn: async ({ id, job_type }: { id: string; job_type: string }) => {
      const defaults = DEFAULTS[job_type];
      if (!defaults) return;
      const { error } = await supabase
        .from("workflow_definitions" as any)
        .update({ steps: JSON.stringify(defaults), updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow_definitions"] }),
  });

  return { ...query, seedIfEmpty, updateWorkflow, reseedWorkflow };
}
