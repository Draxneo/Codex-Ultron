-- First full table-labeling pass. This makes every public table visible in the hygiene/drift dashboard.
-- Labels are conservative: unknown or legacy-looking tables are review-only, not auto-delete.

INSERT INTO public.database_retention_policies (
  table_name,
  category,
  business_use,
  retention_action,
  retention_days,
  enabled,
  owner_visible,
  notes,
  updated_at
)
SELECT
  inv.table_name,
  inv.category,
  inv.business_use,
  inv.retention_action,
  inv.retention_days,
  inv.enabled,
  inv.owner_visible,
  inv.notes,
  now()
FROM (
  SELECT
    c.relname AS table_name,
    CASE
      WHEN c.relname IN ('database_retention_policies') THEN 'Admin / database hygiene'
      WHEN c.relname LIKE 'hcp_%' THEN 'Protected Housecall Pro import'
      WHEN c.relname IN ('customers','customer_addresses','customer_activity_feed','customer_notes','customer_equipment','jobs','job_line_items','job_equipment','job_transcripts','job_attachments','job_media','estimates','estimate_line_items','customer_invoices','customer_invoice_items','invoice_payments','payments','service_agreements','plan_perk_usage','leads') THEN 'Core company records'
      WHEN c.relname IN ('job_carts','job_cart_items','quote_cart_events','quick_quote_links','quotes','quote_options','estimate_presentations','estimate_responses','estimate_reviews','agreement_presentations','agreement_visits','customer_certificates','certificate_templates') THEN 'Customer proposals and approvals'
      WHEN c.relname LIKE '%sms%' OR c.relname LIKE '%call%' OR c.relname LIKE '%phone%' OR c.relname LIKE '%voice%' OR c.relname LIKE '%ivr%' OR c.relname LIKE '%voicemail%' OR c.relname LIKE '%twilio%' OR c.relname IN ('known_contacts','department_forwarding_numbers') THEN 'Communications / phone system'
      WHEN c.relname LIKE '%workflow%' OR c.relname LIKE '%action_item%' OR c.relname LIKE '%owner_input%' OR c.relname IN ('intake_thread_status') THEN 'NOW workflow and human review'
      WHEN c.relname LIKE '%jarvis%' OR c.relname LIKE '%ai_%' OR c.relname LIKE '%copilot%' OR c.relname LIKE '%agent_%' OR c.relname LIKE '%knowledge%' OR c.relname LIKE '%rag_%' OR c.relname LIKE '%prompt%' THEN 'Jarvis / AI knowledge'
      WHEN c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' THEN 'Temporary queues and drafts'
      WHEN c.relname LIKE '%log%' OR c.relname LIKE '%trace%' OR c.relname LIKE '%heartbeat%' OR c.relname LIKE '%usage%' OR c.relname LIKE '%snapshot%' OR c.relname IN ('cron_job_runs','service_health_snapshots','database_cleanup_runs') THEN 'Logs and health telemetry'
      WHEN c.relname LIKE '%archive%' THEN 'Archive / cold storage'
      WHEN c.relname LIKE '%setting%' OR c.relname LIKE '%config%' OR c.relname LIKE '%template%' OR c.relname LIKE '%policy%' OR c.relname IN ('employees','profiles','user_roles','employee_tab_access','employee_pay_rates','pay_rates','company_settings','admin_categories','admin_card_positions') THEN 'Settings and permissions'
      WHEN c.relname LIKE '%catalog%' OR c.relname LIKE '%pricebook%' OR c.relname LIKE '%pricing%' OR c.relname LIKE '%formula%' OR c.relname LIKE '%equipment_matchup%' OR c.relname LIKE '%tier%' OR c.relname LIKE '%addon%' OR c.relname IN ('ahri_lookups','brand_profiles','manufacturer_brochures','service_pricebook','service_repair_items','line_item_templates','cart_addon_rules','cart_discounts','equipment_matchups','repair_catalog','repair_pricing_formulas','pricing_formulas','tier_presets','addons','order_patterns') THEN 'Catalog / pricing / equipment'
      WHEN c.relname LIKE '%permit%' OR c.relname LIKE '%warranty%' OR c.relname LIKE '%rebate%' OR c.relname LIKE '%preinstall%' OR c.relname LIKE '%jurisdiction%' THEN 'Install closeout and compliance'
      WHEN c.relname LIKE '%route%' OR c.relname LIKE '%directions%' OR c.relname LIKE '%geocode%' OR c.relname LIKE '%weather%' OR c.relname LIKE '%property%' THEN 'Dispatch maps and routing'
      WHEN c.relname LIKE 'team_%' OR c.relname LIKE 'chat_%' THEN 'Team communications'
      WHEN c.relname LIKE '%vendor%' OR c.relname LIKE '%supply%' OR c.relname LIKE '%part_%' OR c.relname LIKE '%parts_%' OR c.relname LIKE 'ce_%' THEN 'Vendors, parts, and supply houses'
      WHEN c.relname LIKE '%portal%' OR c.relname LIKE '%referral%' OR c.relname LIKE '%meta_%' THEN 'Marketing and customer portal'
      WHEN c.relname LIKE '%tech_form%' OR c.relname LIKE '%time_entries%' OR c.relname LIKE '%paysheet%' THEN 'Technician forms and payroll'
      ELSE 'Review needed'
    END AS category,
    CASE
      WHEN c.relname = 'database_retention_policies' THEN 'Owner-visible catalog of what each database table is for, how long it should live, and whether cleanup may touch it.'
      WHEN c.relname = 'database_cleanup_runs' THEN 'Audit trail for automatic database cleanup runs and their results.'
      WHEN c.relname = 'database_row_archive' THEN 'Cold archive of rows removed by approved cleanup rules so we can inspect what was cleared.'
      WHEN c.relname LIKE 'hcp_%' THEN 'Protected Housecall Pro import, staging, or reconciliation data. Keep until job, invoice, date, customer, note, and attachment import audits are finished.'
      WHEN c.relname IN ('customers','customer_addresses') THEN 'Permanent customer identity, phone/address matching, and service-location history.'
      WHEN c.relname = 'customer_activity_feed' THEN 'Customer timeline used by Customer Headquarters and Jarvis context.'
      WHEN c.relname LIKE 'customer_%' THEN 'Customer history/details used for service, billing, portal, comfort club, or warranty context.'
      WHEN c.relname = 'jobs' THEN 'Primary work orders and dispatch records from intake through closeout.'
      WHEN c.relname LIKE 'job_%' THEN 'Job-level details: attachments, line items, reminders, carts, invoices, transcripts, and field data.'
      WHEN c.relname IN ('estimates','estimate_line_items') THEN 'Estimate/quote records and their line items, including imported history and current proposals.'
      WHEN c.relname LIKE 'estimate_%' THEN 'Estimate presentation, review, response, or approval support records.'
      WHEN c.relname LIKE 'quote_%' OR c.relname LIKE 'quick_quote%' OR c.relname LIKE '%cart%' THEN 'Quote/cart/customer approval workflow data tied to repair, replacement, or quick quote decisions.'
      WHEN c.relname LIKE '%invoice%' OR c.relname LIKE '%payment%' OR c.relname LIKE '%stripe%' THEN 'Billing, invoice, payment, checkout, and payment audit data.'
      WHEN c.relname LIKE '%sms%' THEN 'SMS send/receive/thread/template/delivery records used by Intake, Team, NOW, and customer communication history.'
      WHEN c.relname LIKE '%call%' OR c.relname LIKE '%voice%' OR c.relname LIKE '%phone%' OR c.relname LIKE '%voicemail%' THEN 'Phone call, recording, routing, softphone, voicemail, or call status records.'
      WHEN c.relname LIKE '%ivr%' THEN 'Visual IVR builder configuration and menu routing records.'
      WHEN c.relname LIKE '%workflow%' OR c.relname LIKE '%action_item%' OR c.relname LIKE '%owner_input%' THEN 'NOW workflow cards, acknowledgements, alerts, and human-in-the-loop action tracking.'
      WHEN c.relname LIKE '%jarvis%' OR c.relname LIKE '%ai_%' OR c.relname LIKE '%copilot%' OR c.relname LIKE '%agent_%' OR c.relname LIKE '%knowledge%' OR c.relname LIKE '%rag_%' OR c.relname LIKE '%prompt%' THEN 'Jarvis/AI instructions, context, learning, tool registry, chat history, or searchable knowledge.'
      WHEN c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' THEN 'Temporary queue/draft/retry records that should not grow forever unless tied to customer history.'
      WHEN c.relname LIKE '%log%' OR c.relname LIKE '%trace%' OR c.relname LIKE '%usage%' OR c.relname LIKE '%snapshot%' OR c.relname LIKE '%health%' THEN 'System health, debugging, cost, telemetry, or operational monitoring records.'
      WHEN c.relname LIKE '%setting%' OR c.relname LIKE '%config%' OR c.relname LIKE '%template%' OR c.relname LIKE '%policy%' THEN 'Configuration or reusable template data that controls how the app behaves.'
      WHEN c.relname IN ('employees','profiles','user_roles','employee_tab_access','employee_pay_rates','pay_rates') THEN 'Team roster, login profile, permissions, and pay configuration.'
      WHEN c.relname LIKE '%catalog%' OR c.relname LIKE '%pricebook%' OR c.relname LIKE '%pricing%' OR c.relname LIKE '%formula%' OR c.relname LIKE '%equipment%' OR c.relname LIKE '%tier%' OR c.relname LIKE '%addon%' OR c.relname IN ('ahri_lookups','brand_profiles','manufacturer_brochures','service_pricebook','repair_catalog') THEN 'Pricebook, equipment, repair catalog, AHRI, brand, and presentation material used to build quotes.'
      WHEN c.relname LIKE '%permit%' OR c.relname LIKE '%warranty%' OR c.relname LIKE '%preinstall%' THEN 'Install closeout, permitting, warranty, survey, inspection, and compliance workflow data.'
      WHEN c.relname LIKE '%route%' OR c.relname LIKE '%directions%' OR c.relname LIKE '%geocode%' OR c.relname LIKE '%weather%' OR c.relname LIKE '%property%' THEN 'Map, address, weather, route, ETA, and property-context cache data.'
      WHEN c.relname LIKE 'team_%' OR c.relname LIKE 'chat_%' THEN 'Internal team communication, huddles, messages, read state, notifications, and reactions.'
      WHEN c.relname LIKE '%vendor%' OR c.relname LIKE '%supply%' OR c.relname LIKE '%part_%' OR c.relname LIKE '%parts_%' OR c.relname LIKE 'ce_%' THEN 'Vendor, supply house, part ordering, and procurement support records.'
      WHEN c.relname LIKE '%portal%' OR c.relname LIKE '%referral%' OR c.relname LIKE '%meta_%' THEN 'Customer portal, referral, remarketing, and audience sync support records.'
      WHEN c.relname LIKE '%tech_form%' OR c.relname LIKE '%time_entries%' OR c.relname LIKE '%paysheet%' THEN 'Technician field forms, photos, versions, time tracking, and payroll support records.'
      ELSE 'Unsorted application table. Labeled for visibility; review before using in Jarvis decisions or cleanup automation.'
    END AS business_use,
    CASE
      WHEN c.relname IN ('customers','customer_addresses','jobs','job_attachments','job_media','job_transcripts','estimates','estimate_line_items','customer_invoices','customer_invoice_items','invoice_payments','payments','service_agreements','employees','profiles','user_roles','company_settings','database_retention_policies') THEN 'keep'
      WHEN c.relname LIKE 'hcp_%' THEN 'review'
      WHEN c.relname LIKE '%archive%' THEN 'keep'
      WHEN c.relname LIKE '%template%' OR c.relname LIKE '%config%' OR c.relname LIKE '%setting%' OR c.relname LIKE '%policy%' OR c.relname LIKE '%catalog%' OR c.relname LIKE '%pricebook%' OR c.relname LIKE '%pricing%' OR c.relname LIKE '%formula%' OR c.relname LIKE '%equipment%' OR c.relname LIKE '%permit_authorities%' THEN 'keep'
      WHEN c.relname LIKE '%log%' OR c.relname LIKE '%trace%' OR c.relname LIKE '%usage%' OR c.relname LIKE '%snapshot%' OR c.relname LIKE '%health%' OR c.relname LIKE '%heartbeat%' THEN 'delete'
      WHEN c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' THEN 'archive_delete'
      WHEN c.relname LIKE '%cache%' THEN 'delete'
      WHEN c.relname LIKE '%session%' OR c.relname LIKE '%token%' THEN 'delete'
      WHEN c.relname LIKE '%visit%' OR c.relname LIKE '%event%' THEN 'rollup_delete'
      ELSE 'review'
    END AS retention_action,
    CASE
      WHEN c.relname LIKE 'hcp_%' THEN NULL
      WHEN c.relname IN ('customers','customer_addresses','jobs','job_attachments','job_media','job_transcripts','estimates','estimate_line_items','customer_invoices','customer_invoice_items','invoice_payments','payments','service_agreements','employees','profiles','user_roles','company_settings','database_retention_policies') THEN NULL
      WHEN c.relname LIKE '%archive%' THEN NULL
      WHEN c.relname LIKE '%template%' OR c.relname LIKE '%config%' OR c.relname LIKE '%setting%' OR c.relname LIKE '%policy%' OR c.relname LIKE '%catalog%' OR c.relname LIKE '%pricebook%' OR c.relname LIKE '%pricing%' OR c.relname LIKE '%formula%' OR c.relname LIKE '%equipment%' THEN NULL
      WHEN c.relname LIKE '%trace%' OR c.relname LIKE '%debug%' OR c.relname LIKE '%heartbeat%' THEN 14
      WHEN c.relname LIKE '%usage%' OR c.relname LIKE '%rollup%' OR c.relname LIKE '%health%' THEN 365
      WHEN c.relname LIKE '%log%' THEN 90
      WHEN c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' THEN 30
      WHEN c.relname LIKE '%cache%' THEN 30
      WHEN c.relname LIKE '%session%' OR c.relname LIKE '%token%' THEN 30
      WHEN c.relname LIKE '%visit%' OR c.relname LIKE '%event%' THEN 365
      ELSE NULL
    END AS retention_days,
    CASE
      WHEN c.relname LIKE 'hcp_%' THEN false
      WHEN c.relname LIKE '%log%' OR c.relname LIKE '%trace%' OR c.relname LIKE '%usage%' OR c.relname LIKE '%snapshot%' OR c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' OR c.relname LIKE '%cache%' OR c.relname LIKE '%session%' OR c.relname LIKE '%token%' THEN true
      WHEN c.relname IN ('database_retention_policies') THEN false
      ELSE false
    END AS enabled,
    true AS owner_visible,
    CASE
      WHEN c.relname LIKE 'hcp_%' THEN 'Protected import data. Do not delete until Housecall Pro reconciliation is complete.'
      WHEN c.relname LIKE '%log%' OR c.relname LIKE '%trace%' OR c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' OR c.relname LIKE '%cache%' THEN 'Safe to clean only through approved cleanup functions; never remove customer-facing history blindly.'
      WHEN c.relname LIKE '%jarvis%' OR c.relname LIKE '%ai_%' OR c.relname LIKE '%copilot%' OR c.relname LIKE '%agent_%' OR c.relname LIKE '%knowledge%' OR c.relname LIKE '%rag_%' OR c.relname LIKE '%prompt%' THEN 'Jarvis-related table. Keep visible so old AI paths do not become hidden truth.'
      WHEN c.relname IN ('customers','jobs','estimates','customer_invoices','job_attachments','sms_log','call_log') THEN 'Core operational table. Keep permanently unless a later archive plan is explicitly approved.'
      ELSE 'First-pass label. Review and refine as the app stabilizes.'
    END AS notes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
) inv
ON CONFLICT (table_name) DO UPDATE
SET
  category = EXCLUDED.category,
  business_use = EXCLUDED.business_use,
  retention_action = EXCLUDED.retention_action,
  retention_days = EXCLUDED.retention_days,
  enabled = EXCLUDED.enabled,
  owner_visible = EXCLUDED.owner_visible,
  notes = CASE
    WHEN public.database_retention_policies.table_name IN ('hcp_raw_objects', 'hcp_import_runs') THEN public.database_retention_policies.notes
    ELSE EXCLUDED.notes
  END,
  updated_at = now();

-- Keep explicit protection on raw HCP import tables even after the broad pass above.
UPDATE public.database_retention_policies
SET retention_action = 'review',
    enabled = false,
    retention_days = NULL,
    owner_visible = true,
    notes = 'Protected until the Housecall Pro import audit is complete. Do not auto-delete.',
    updated_at = now()
WHERE table_name IN ('hcp_raw_objects', 'hcp_import_runs');

UPDATE public.database_retention_policies
SET retention_action = 'review',
    enabled = false,
    retention_days = 90,
    owner_visible = true,
    notes = 'Housecall Pro import error table. Review during reconciliation; do not auto-delete yet.',
    updated_at = now()
WHERE table_name = 'hcp_import_errors';

UPDATE public.database_retention_policies
SET retention_action = 'keep',
    enabled = true,
    retention_days = NULL,
    owner_visible = true,
    notes = 'Imported Housecall Pro history/archive metadata. Keep while reconciliation is active; incomplete archive statuses are reviewed separately.',
    updated_at = now()
WHERE table_name IN ('hcp_attachments', 'hcp_notes');

-- Jarvis/NOW source-of-truth tables should stay visible and durable unless a later pruning rule is explicit.
UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = true,
    owner_visible = true,
    notes = 'Jarvis/NOW source-of-truth table. Keep visible so old AI paths do not become hidden truth.',
    updated_at = now()
WHERE table_name IN (
  'ai_agents',
  'ai_agent_connections',
  'agent_tools',
  'agent_instructions',
  'agent_learnings',
  'ai_model_config',
  'prompt_sections',
  'copilot_training',
  'copilot_permissions',
  'workflow_definitions'
);

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 90,
    enabled = true,
    owner_visible = true,
    notes = 'Jarvis conversation/runtime table. Archive before pruning because it may contain useful customer context.',
    updated_at = now()
WHERE table_name IN ('copilot_messages', 'copilot_sessions');

UPDATE public.database_retention_policies
SET retention_action = 'rollup_delete',
    retention_days = 90,
    enabled = true,
    owner_visible = true,
    notes = 'Jarvis usage telemetry. Keep summaries, then clear detail rows.',
    updated_at = now()
WHERE table_name IN ('copilot_button_clicks');

UPDATE public.database_retention_policies
SET retention_action = 'review',
    retention_days = 180,
    enabled = false,
    owner_visible = true,
    notes = 'Knowledge/RAG table. Review with Jarvis before pruning so we do not delete useful training context.',
    updated_at = now()
WHERE table_name IN ('knowledge_chunks', 'rag_feedback');

-- Permanent customer, work, money, and communication history.
UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = true,
    owner_visible = true,
    notes = 'Permanent business record. Do not prune without an explicit archive plan.',
    updated_at = now()
WHERE table_name IN (
  'customers',
  'customer_addresses',
  'customer_equipment',
  'customer_notes',
  'customer_activity_feed',
  'customer_discovery_answers',
  'customer_certificates',
  'jobs',
  'job_line_items',
  'job_carts',
  'job_cart_items',
  'job_attachments',
  'job_reminders',
  'job_transcripts',
  'job_equipment',
  'job_invoices',
  'estimates',
  'estimate_line_items',
  'estimate_presentations',
  'estimate_responses',
  'estimate_reviews',
  'quotes',
  'customer_invoices',
  'customer_invoice_items',
  'invoice_payments',
  'stripe_events',
  'payment_plan_rules',
  'service_agreements',
  'agreement_visits',
  'agreement_presentations',
  'plan_perk_usage',
  'call_log',
  'sms_log',
  'voicemails',
  'known_contacts'
);

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 365,
    enabled = true,
    owner_visible = true,
    notes = 'Customer-facing link/event trail. Archive before pruning so approvals and quote activity can be audited.',
    updated_at = now()
WHERE table_name IN ('quick_quote_links', 'quote_cart_events', 'job_attachment_cache', 'live_transcripts');

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 30,
    enabled = true,
    owner_visible = false,
    notes = 'Short-lived customer access/session token. Safe to delete after expiration window.',
    updated_at = now()
WHERE table_name IN ('customer_portal_codes', 'customer_portal_sessions', 'customer_intake_tokens');

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 180,
    enabled = true,
    owner_visible = false,
    notes = 'Temporary customer portal invite trail. Archive before pruning.',
    updated_at = now()
WHERE table_name IN ('customer_portal_invites');

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 30,
    enabled = true,
    owner_visible = true,
    notes = 'Temporary intake state. Archive then prune after it is no longer active.',
    updated_at = now()
WHERE table_name IN ('sms_intake_sessions');

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 90,
    enabled = true,
    owner_visible = true,
    notes = 'Intake handoff state. Archive after the active customer thread has moved into NOW, dispatch, quote, or history.',
    updated_at = now()
WHERE table_name IN ('intake_thread_status');

UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = true,
    owner_visible = true,
    notes = 'Phone/SMS/IVR configuration. This controls live communications and should not auto-expire.',
    updated_at = now()
WHERE table_name IN ('ivr_config', 'ivr_menu_options', 'call_routing_rules', 'department_forwarding_numbers', 'sms_templates', 'sms_thread_settings');

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 365,
    enabled = true,
    owner_visible = false,
    notes = 'Internal team audio call history. Archive before pruning; not customer history.',
    updated_at = now()
WHERE table_name IN ('team_audio_calls', 'team_audio_call_participants');

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 90,
    enabled = true,
    owner_visible = true,
    notes = 'Operational phone alert. Clear after acknowledgement/age so alert tables do not grow forever.',
    updated_at = now()
WHERE table_name IN ('oncall_alerts');

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 180,
    enabled = true,
    owner_visible = true,
    notes = 'Weather SMS campaign artifact. Archive after campaign window.',
    updated_at = now()
WHERE table_name IN ('weather_sms_codes');

-- Admin, settings, catalog, media, team, and system-health overrides from the table audit.
UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Admin/settings source-of-truth table. Keep visible and do not auto-prune.',
    updated_at = now()
WHERE table_name IN (
  'database_retention_policies',
  'admin_categories',
  'admin_card_positions',
  'company_settings',
  'employees',
  'profiles',
  'user_roles',
  'employee_tab_access',
  'employee_email_aliases',
  'employee_pay_rates',
  'pay_rates',
  'auto_assign_rules',
  'payment_plan_rules',
  'deposit_schedules'
);

UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Reusable template or workflow definition. Jarvis and the UI use these as configuration, not throwaway rows.',
    updated_at = now()
WHERE table_name IN (
  'task_templates',
  'template_tasks',
  'certificate_templates',
  'maintenance_plan_templates',
  'line_item_templates',
  'tech_form_fields',
  'tech_form_versions',
  'workflow_definitions',
  'presentation_sections'
);

UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Catalog, pricebook, equipment, or presentation library. Keep as business configuration.',
    updated_at = now()
WHERE table_name IN (
  'addons',
  'brand_profiles',
  'brochure_blocks',
  'cart_addon_rules',
  'cart_discounts',
  'equipment_matchups',
  'manufacturer_brochures',
  'parts_catalog',
  'pricing_formulas',
  'repair_catalog',
  'repair_pricing_formulas',
  'service_pricebook',
  'service_repair_items',
  'tier_presets'
);

UPDATE public.database_retention_policies
SET retention_action = 'review',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Catalog/media table that needs human review before cleanup because it may contain useful quote or field history.',
    updated_at = now()
WHERE table_name IN ('ahri_lookups', 'order_patterns', 'task_photos', 'tech_form_photos');

UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Field media/compliance record. Keep until the install/service archive plan is explicit.',
    updated_at = now()
WHERE table_name IN ('preinstall_photos', 'quick_link_logos');

UPDATE public.database_retention_policies
SET retention_action = 'review',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Team communication history. Review before pruning so internal coordination does not disappear silently.',
    updated_at = now()
WHERE table_name IN (
  'chat_channels',
  'chat_huddles',
  'chat_messages',
  'chat_reactions',
  'team_conversations',
  'team_conversation_members',
  'team_messages',
  'team_audio_calls'
);

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 365,
    enabled = true,
    owner_visible = true,
    notes = 'Internal read-state or participant marker. Safe cleanup candidate after a long window.',
    updated_at = now()
WHERE table_name IN ('chat_read_cursors', 'team_audio_call_participants');

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 90,
    enabled = true,
    owner_visible = true,
    notes = 'Short-lived team notification. Clear after it is no longer useful.',
    updated_at = now()
WHERE table_name IN ('team_notifications');

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 90,
    enabled = true,
    owner_visible = true,
    notes = 'Operational log. Keep recent debugging/audit history, then prune to prevent runaway growth.',
    updated_at = now()
WHERE table_name IN ('activity_log', 'system_error_log', 'push_delivery_log');

UPDATE public.database_retention_policies
SET retention_action = 'rollup_delete',
    retention_days = 14,
    enabled = true,
    owner_visible = true,
    notes = 'Raw API usage/cost receipts. Keep daily rollups, then clear detail rows.',
    updated_at = now()
WHERE table_name IN ('api_usage_log');

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 400,
    enabled = true,
    owner_visible = true,
    notes = 'Daily or scheduled system history. Keep about a year for trend visibility.',
    updated_at = now()
WHERE table_name IN ('api_usage_daily_rollups', 'cron_job_runs', 'service_health_snapshots', 'database_cleanup_runs');

UPDATE public.database_retention_policies
SET retention_action = 'delete',
    retention_days = 14,
    enabled = true,
    owner_visible = true,
    notes = 'Short-lived debug trace. Keep briefly only for troubleshooting.',
    updated_at = now()
WHERE table_name IN ('system_trace_events');

UPDATE public.database_retention_policies
SET retention_action = 'archive_delete',
    retention_days = 30,
    enabled = true,
    owner_visible = true,
    notes = 'Retry queue. Archive failed payloads, then prune so failed background work does not pile up forever.',
    updated_at = now()
WHERE table_name IN ('retry_queue');

UPDATE public.database_retention_policies
SET retention_action = 'review',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'On-call alert history. Review the live use before automating cleanup.',
    updated_at = now()
WHERE table_name IN ('oncall_alerts');

UPDATE public.database_retention_policies
SET retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = false,
    notes = 'Cold archive of rows removed by approved hygiene cleanup.',
    updated_at = now()
WHERE table_name = 'database_row_archive';

-- Remove the remaining generic bucket from the first pass.
UPDATE public.database_retention_policies
SET category = 'Settings and permissions',
    business_use = 'Automation, payment, scheduling, or admin setting used to control how the app behaves.',
    retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Admin/settings source-of-truth table. Keep visible and do not auto-prune.',
    updated_at = now()
WHERE table_name IN ('auto_assign_rules', 'deposit_schedules', 'payment_plan_rules');

UPDATE public.database_retention_policies
SET category = 'Catalog / pricing / equipment',
    business_use = 'Sales presentation, comparison, brochure, or customer-facing quote content.',
    retention_action = 'keep',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Presentation and quote content library. Keep as business configuration.',
    updated_at = now()
WHERE table_name IN ('brochure_blocks', 'comparison_blocks', 'presentation_sections');

UPDATE public.database_retention_policies
SET category = 'Core company records',
    business_use = 'Customer/job context used by Intake, Dispatch, NOW, Jarvis, and Customer Headquarters.',
    retention_action = 'keep',
    retention_days = NULL,
    enabled = true,
    owner_visible = true,
    notes = 'Permanent business context. Do not prune without an explicit archive plan.',
    updated_at = now()
WHERE table_name IN ('customer_discovery_answers', 'job_reminders');

UPDATE public.database_retention_policies
SET category = 'Marketing and customer portal',
    business_use = 'Lead follow-up, drip campaign, portal access, or customer remarketing support data.',
    retention_action = CASE
      WHEN table_name IN ('customer_intake_tokens') THEN 'delete'
      ELSE 'review'
    END,
    retention_days = CASE
      WHEN table_name IN ('customer_intake_tokens') THEN 30
      ELSE NULL
    END,
    enabled = CASE
      WHEN table_name IN ('customer_intake_tokens') THEN true
      ELSE false
    END,
    owner_visible = true,
    notes = CASE
      WHEN table_name IN ('customer_intake_tokens') THEN 'Short-lived intake/customer access token. Safe to delete after expiration window.'
      ELSE 'Lead or campaign workflow table. Review before cleanup so follow-up logic stays intact.'
    END,
    updated_at = now()
WHERE table_name IN ('customer_intake_tokens', 'follow_up_inquiries', 'message_sequences');

UPDATE public.database_retention_policies
SET category = 'Media cache and attachments',
    business_use = 'Cached or indexed attachment/transcript data used to make field photos and call context load quickly.',
    retention_action = 'archive_delete',
    retention_days = 365,
    enabled = true,
    owner_visible = true,
    notes = 'Cache-like support table. Archive first, then prune only after permanent attachments/transcripts are confirmed.',
    updated_at = now()
WHERE table_name IN ('job_attachment_cache', 'live_transcripts');

UPDATE public.database_retention_policies
SET category = 'Billing and payments',
    business_use = 'Stripe/payment event history used to prove customer payment state and troubleshoot billing.',
    retention_action = 'keep',
    retention_days = NULL,
    enabled = true,
    owner_visible = true,
    notes = 'Payment audit record. Keep unless a later accounting archive policy is approved.',
    updated_at = now()
WHERE table_name IN ('stripe_events');

UPDATE public.database_retention_policies
SET category = 'Team quick links',
    business_use = 'Internal quick links and categories used by Team Headquarters.',
    retention_action = 'review',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Team resource configuration. Review before pruning so useful operational links are not lost.',
    updated_at = now()
WHERE table_name IN ('quick_link_categories', 'quick_links');

UPDATE public.database_retention_policies
SET category = 'Reporting and KPIs',
    business_use = 'Business target or reporting configuration for admin dashboards.',
    retention_action = 'review',
    retention_days = NULL,
    enabled = false,
    owner_visible = true,
    notes = 'Reporting configuration. Review before pruning.',
    updated_at = now()
WHERE table_name IN ('profit_kpi_targets');

UPDATE public.database_retention_policies
SET category = 'Communications / phone system',
    business_use = 'Device push token used for notifications and communication alerts.',
    retention_action = 'delete',
    retention_days = 30,
    enabled = true,
    owner_visible = true,
    notes = 'Short-lived device token. Safe to delete stale tokens.',
    updated_at = now()
WHERE table_name IN ('push_tokens');

UPDATE public.database_retention_policies
SET category = 'Dispatch maps and routing',
    business_use = 'Technician location event stream used for dispatch visibility, ETA review, and route context.',
    retention_action = 'rollup_delete',
    retention_days = 365,
    enabled = false,
    owner_visible = true,
    notes = 'Location event history. Keep summaries and review before enabling cleanup.',
    updated_at = now()
WHERE table_name IN ('tech_location_events');
