-- JARVIS Core cleanup pass:
-- - Keep the working foundation.
-- - Disable stale tool rows instead of deleting them.
-- - Add one locked source-of-truth prompt section for the new company-brain model.

insert into public.prompt_sections (
  slug,
  title,
  category,
  content,
  route_scope,
  is_active,
  is_locked,
  sort_order
) values (
  'company_brains_v2',
  'UltraOffice Company Brains V2',
  'core',
  'UltraOffice is organized around company brains, not generic CRM modules.

Intake Brain owns Who / What / Why: calls, SMS, customer matching, unknown numbers, booking or estimate intent, missing information, address verification, and human-approved next actions.

Operations Brain owns When / Where: dispatch board, calendar, tech assignment, route fit, schedule risk, backlog placement, and customer update actions for work already on the board.

Field Brain owns the technician loop: arrive, diagnose, capture photos/notes, build repair or replacement options, present comfort/reliability/efficiency/peace-of-mind/warranty/rebate/financing value, send approval links, and hand approved replacement work back to dispatch.

Customer Brain owns relationship memory: jobs, estimates, invoices, attachments, calls, SMS, Comfort Club, warranty, labor warranty, parts warranty, notes, follow-up, renewal, and remarketing context.

Quote Brain owns open estimates and follow-up: viewed, stale, approved, declined, financing, approval links, next human-approved touch, and won/lost outcomes.

Team Brain owns internal communication: team chat, handoffs, internal alerts, shared resources, and quick links.

All brains share the same underlying data. JARVIS prepares actions; humans approve important operational or customer-facing changes. Prefer macro buttons and review cards over long manual data entry.',
  null,
  true,
  true,
  12
) on conflict (slug) do update set
  title = excluded.title,
  category = excluded.category,
  content = excluded.content,
  route_scope = excluded.route_scope,
  is_active = true,
  is_locked = true,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.agent_tools
set is_enabled = false
where function_name in (
  'create_todo',
  'complete_todo',
  'send_brochure_email',
  'read_email_thread',
  'search_emails',
  'extract_email_attachment',
  'create_vendor',
  'search_vendor',
  'get_workflow_status',
  'order_from_supplyhouse',
  'order_from_carrier_enterprise',
  'search_supplyhouse',
  'search_carrier_enterprise',
  'ahri_lookup_carrier_enterprise'
);

with canonical_tools(function_name, name, description) as (
  values
    ('web_search', 'Web Search', 'Search current web information when approved and relevant.'),
    ('scrape_url', 'Scrape URL', 'Read a specific web page for research or reference.'),
    ('update_instruction', 'Update Instruction', 'Queue an instruction update for JARVIS learning.'),
    ('log_learning', 'Log Learning', 'Record a correction or lesson for JARVIS.'),
    ('lookup_equipment', 'Lookup Equipment', 'Search equipment matchups by brand, tonnage, system type, tier, and orientation.'),
    ('verify_address', 'Verify Address', 'Verify a service address before saving or booking work.'),
    ('send_sms_to_employee', 'Send SMS to Employee', 'Send an internal team SMS.'),
    ('send_tech_form_link', 'Send Tech Form Link', 'Send a tech form link for a job.'),
    ('search_sms_history', 'Search SMS History', 'Search saved customer SMS history.'),
    ('search_call_history', 'Search Call History', 'Search saved call history.'),
    ('read_chat_messages', 'Read Team Chat', 'Read recent internal team chat messages.'),
    ('send_chat_message', 'Send Team Chat Message', 'Send an internal team chat message.'),
    ('create_quote', 'Create Quote', 'Create a database-backed equipment quote from exact matchups.'),
    ('generate_install_quote', 'Generate Install Quote', 'Generate a full install quote from technician-style equipment selection.'),
    ('convert_estimate_to_job', 'Convert Estimate to Job', 'Convert an approved estimate into a job.'),
    ('generate_letterhead_document', 'Generate Letterhead Document', 'Generate a company letterhead document.'),
    ('get_travel_times', 'Get Travel Times', 'Calculate travel times between jobs.'),
    ('check_scheduling_fit', 'Check Scheduling Fit', 'Check whether a proposed job fits a tech route.'),
    ('suggest_schedule_optimization', 'Suggest Schedule Optimization', 'Suggest dispatch schedule improvements.'),
    ('search_customer', 'Search Customer', 'Search customer records by name, phone, or email.'),
    ('create_customer', 'Create Customer', 'Prepare a customer record for human-approved creation.'),
    ('update_customer', 'Update Customer', 'Prepare customer updates for human approval.'),
    ('create_job', 'Create Job Proposal', 'Prepare a pending appointment card; does not silently book work.'),
    ('invoke_repair_quote', 'Repair Quote Engine', 'Use the repair quote specialist.'),
    ('invoke_supplyhouse', 'SupplyHouse Account Search', 'Use SupplyHouse contractor account tooling.'),
    ('invoke_carrier_enterprise', 'Carrier Enterprise Account Search', 'Use Carrier Enterprise contractor account tooling.'),
    ('invoke_invoicing', 'Invoicing Action', 'Prepare invoice or payment-link actions.'),
    ('update_job_field', 'Update Job Field', 'Prepare job field updates for approval.'),
    ('create_parts_order', 'Create Parts Order', 'Prepare a parts or equipment order.'),
    ('update_warranty_status', 'Update Warranty Status', 'Prepare warranty registration status updates.'),
    ('get_live_transcript', 'Live Call Transcript', 'Read final live transcript lines for an active call.'),
    ('suggest_actions', 'Smart Action Buttons', 'Return structured next-action button suggestions.'),
    ('move_photos_to_job', 'Move Photos to Job', 'Attach SMS/media photos to the right job.')
)
insert into public.agent_tools (function_name, name, description, is_enabled)
select function_name, name, description, true
from canonical_tools c
where not exists (
  select 1 from public.agent_tools existing
  where existing.function_name = c.function_name
);
