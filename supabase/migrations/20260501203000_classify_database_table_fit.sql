-- Add a second layer of database labels: does this table fit the current app,
-- is it protected legacy import data, or is it a candidate to merge later?

ALTER TABLE public.database_retention_policies
  ADD COLUMN IF NOT EXISTS app_status text NOT NULL DEFAULT 'review',
  ADD COLUMN IF NOT EXISTS consolidation_group text,
  ADD COLUMN IF NOT EXISTS architecture_note text;

COMMENT ON COLUMN public.database_retention_policies.app_status IS
  'How this table fits the current UltraOffice app: current, protected_import, runtime_cache, future_placeholder, merge_candidate, or review.';

COMMENT ON COLUMN public.database_retention_policies.consolidation_group IS
  'Plain-English group for tables that should be reviewed together before any merge or redesign.';

COMMENT ON COLUMN public.database_retention_policies.architecture_note IS
  'Owner-facing architecture note explaining whether to keep, merge later, protect, or revisit.';

UPDATE public.database_retention_policies
SET
  app_status = 'review',
  consolidation_group = NULL,
  architecture_note = 'Needs review before Jarvis or cleanup automation relies on it.',
  updated_at = now();

-- Current foundation: these are the tables the live app is built around.
UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'customer_job_money',
  category = 'Core company records',
  architecture_note = 'Current app foundation. Keep normalized; speed should come from indexes/views, not merging these into one giant table.',
  updated_at = now()
WHERE table_name IN (
  'customers',
  'customer_addresses',
  'customer_activity_feed',
  'customer_discovery_answers',
  'customer_equipment',
  'customer_notes',
  'jobs',
  'job_equipment',
  'job_line_items',
  'job_reminders',
  'job_transcripts',
  'estimates',
  'estimate_line_items'
);

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'billing_and_payments',
  category = 'Billing and payments',
  business_use = 'Invoice, invoice line item, payment, or payment provider event history.',
  architecture_note = 'Current financial record. Do not merge into jobs; use views for office screens that need job plus invoice together.',
  retention_action = 'keep',
  retention_days = NULL,
  enabled = true,
  updated_at = now()
WHERE table_name IN (
  'customer_invoices',
  'customer_invoice_items',
  'invoice_payments',
  'stripe_events'
);

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'customer_communications',
  category = 'Communications / phone system',
  business_use = 'Phone, SMS, voicemail, routing, IVR, or communication lookup data.',
  architecture_note = 'Current communication backbone. Keep call and SMS tables separate for speed and Twilio clarity; combine in a view for inbox screens.',
  updated_at = now()
WHERE table_name IN (
  'call_log',
  'sms_log',
  'voicemails',
  'known_contacts',
  'ivr_config',
  'ivr_menu_options',
  'call_routing_rules',
  'department_forwarding_numbers',
  'sms_templates',
  'sms_thread_settings'
);

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'now_workflows',
  category = 'NOW workflow and human review',
  business_use = 'NOW cards, workflow definitions, alerts, acknowledgements, and human-in-the-loop requests.',
  architecture_note = 'Current AI operations layer. Keep this as the coordination layer rather than scattering workflow state across every feature table.',
  updated_at = now()
WHERE table_name IN (
  'action_items',
  'workflow_definitions',
  'workflow_alerts',
  'workflow_card_acknowledgements',
  'owner_input_requests',
  'intake_thread_status'
);

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'jarvis_brain',
  category = 'Jarvis / AI knowledge',
  business_use = 'Jarvis instructions, agent registry, tool permissions, prompts, training, conversation history, or searchable knowledge.',
  architecture_note = CASE
    WHEN table_name IN ('copilot_messages', 'copilot_sessions', 'copilot_button_clicks')
      THEN 'Runtime Jarvis conversation/usage history. Useful, but should eventually archive so it does not become stale hidden truth.'
    WHEN table_name IN ('knowledge_chunks', 'rag_feedback')
      THEN 'Jarvis knowledge/RAG area. Review before pruning because this affects what Jarvis knows.'
    ELSE 'Current Jarvis source-of-truth configuration. Keep centralized and visible.'
  END,
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
  'copilot_messages',
  'copilot_sessions',
  'copilot_button_clicks',
  'knowledge_chunks',
  'rag_feedback'
);

-- Protected import/history data. It is legacy-sourced, but still important until reconciliation is complete.
UPDATE public.database_retention_policies
SET
  app_status = 'protected_import',
  consolidation_group = 'housecall_reconciliation',
  category = 'Protected Housecall Pro import',
  business_use = 'Housecall Pro import, raw object, note, attachment, or reconciliation history.',
  architecture_note = 'Legacy source data, but protected. Do not delete until job/date/invoice/photo reconciliation is complete.',
  retention_action = CASE WHEN table_name IN ('hcp_attachments', 'hcp_notes') THEN 'keep' ELSE 'review' END,
  enabled = CASE WHEN table_name IN ('hcp_attachments', 'hcp_notes') THEN true ELSE false END,
  updated_at = now()
WHERE table_name LIKE 'hcp_%';

-- Pricing, quote presentation, repair catalog, and equipment selection.
UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'pricebook_quote_catalog',
  category = 'Catalog / pricing / equipment',
  business_use = 'Pricebook, repair catalog, equipment matchup, presentation content, or quote rule.',
  architecture_note = 'Current quoting/catalog area. Many small tables are fine here because this is configuration; build one view/API for fast quote screens.',
  retention_action = CASE WHEN table_name IN ('ahri_lookups', 'order_patterns') THEN 'review' ELSE 'keep' END,
  enabled = false,
  updated_at = now()
WHERE table_name IN (
  'addons',
  'ahri_lookups',
  'brand_profiles',
  'brochure_blocks',
  'cart_addon_rules',
  'cart_discounts',
  'comparison_blocks',
  'equipment_matchups',
  'manufacturer_brochures',
  'order_patterns',
  'parts_catalog',
  'pricing_formulas',
  'repair_catalog',
  'repair_pricing_formulas',
  'service_pricebook',
  'service_repair_items',
  'tier_presets',
  'presentation_sections'
);

-- Job carts, public quote links, estimates responses, certificates, and agreements.
UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'customer_proposals',
  category = 'Customer proposals and approvals',
  business_use = 'Customer-facing approval, quote, cart, certificate, membership, or agreement presentation data.',
  architecture_note = 'Current proposal/customer decision trail. Do not merge into estimates yet; use a unified proposal view for customer-facing screens.',
  updated_at = now()
WHERE table_name IN (
  'job_carts',
  'job_cart_items',
  'quick_quote_links',
  'quote_cart_events',
  'quotes',
  'quote_options',
  'estimate_presentations',
  'estimate_responses',
  'estimate_reviews',
  'customer_certificates',
  'certificate_templates',
  'agreement_presentations',
  'agreement_visits'
);

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'memberships_and_service_plans',
  category = 'Memberships and service plans',
  business_use = 'Comfort Club/service agreement, plan template, visit history, and perk usage.',
  architecture_note = 'Current customer relationship area. Keep separate from invoices and jobs so renewals/warranty/club status stay clear.',
  retention_action = 'keep',
  retention_days = NULL,
  enabled = true,
  updated_at = now()
WHERE table_name IN (
  'service_agreements',
  'maintenance_plan_templates',
  'plan_perk_usage'
);

-- Attachments/media: keep permanent attachments separate from caches.
UPDATE public.database_retention_policies
SET
  app_status = CASE
    WHEN table_name IN ('job_attachment_cache', 'live_transcripts') THEN 'runtime_cache'
    ELSE 'current'
  END,
  consolidation_group = 'media_and_attachments',
  category = 'Media and attachments',
  business_use = 'Job photos, form photos, install photos, cached attachments, or call transcript media.',
  architecture_note = CASE
    WHEN table_name IN ('job_attachment_cache', 'live_transcripts')
      THEN 'Cache/support table. Keep it small and refreshable; permanent media should live in the attachment/photo history tables.'
    ELSE 'Current media history. Do not hard-delete without confirming Supabase Storage copies and customer/job linkage.'
  END,
  updated_at = now()
WHERE table_name IN (
  'job_attachments',
  'job_attachment_cache',
  'live_transcripts',
  'task_photos',
  'tech_form_photos',
  'preinstall_photos',
  'quick_link_logos'
);

-- Admin/config.
UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'admin_settings',
  category = 'Settings and permissions',
  business_use = 'Admin settings, team roster, roles, permissions, pay setup, or app layout configuration.',
  architecture_note = 'Current app configuration. Small tables are OK; merge only if the UI becomes confusing, not for speed.',
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
  'deposit_schedules',
  'line_item_templates',
  'task_templates',
  'template_tasks',
  'tech_form_fields',
  'tech_form_versions'
);

-- Team communication has two families. Keep visible, but review whether chat_* and team_* should become one.
UPDATE public.database_retention_policies
SET
  app_status = CASE WHEN table_name LIKE 'chat_%' THEN 'merge_candidate' ELSE 'current' END,
  consolidation_group = 'team_communications',
  category = 'Team communications',
  business_use = 'Team conversations, internal messages, huddles, reactions, read cursors, notifications, or internal audio calls.',
  architecture_note = CASE
    WHEN table_name LIKE 'chat_%'
      THEN 'Potential older parallel team-chat model. Review against team_* tables before building more features.'
    ELSE 'Current Team Headquarters communication model. Keep as the likely canonical path.'
  END,
  updated_at = now()
WHERE table_name LIKE 'chat_%'
   OR table_name IN (
    'team_conversations',
    'team_conversation_members',
    'team_messages',
    'team_audio_calls',
    'team_audio_call_participants',
    'team_notifications',
    'quick_link_categories',
    'quick_links'
   );

-- Dispatch maps, routing, and location caches.
UPDATE public.database_retention_policies
SET
  app_status = CASE
    WHEN table_name IN ('directions_cache', 'geocode_cache', 'route_travel_cache', 'weather_forecast_cache') THEN 'runtime_cache'
    ELSE 'current'
  END,
  consolidation_group = 'dispatch_maps_routing',
  category = 'Dispatch maps and routing',
  business_use = 'Route, ETA, geocode, technician location, weather, or property context.',
  architecture_note = CASE
    WHEN table_name LIKE '%cache'
      THEN 'Cache table. Good for speed and Google Maps cost control; safe to expire when stale.'
    ELSE 'Dispatch support table. Keep visible and review before pruning.'
  END,
  updated_at = now()
WHERE table_name IN (
  'directions_cache',
  'geocode_cache',
  'route_travel_cache',
  'weather_forecast_cache',
  'route_optimization_runs',
  'route_optimization_suggestions',
  'tech_location_events',
  'property_data'
);

-- Temporary/runtime tables should not grow forever.
UPDATE public.database_retention_policies
SET
  app_status = 'runtime_cache',
  consolidation_group = 'temporary_runtime',
  architecture_note = 'Runtime-only table. It should have a TTL or archive path so old testing/automation state cannot pile up.',
  updated_at = now()
WHERE table_name IN (
  'outbound_drafts',
  'retry_queue',
  'route_sms_queue',
  'sms_intake_sessions',
  'push_tokens',
  'system_trace_events',
  'system_error_log',
  'push_delivery_log',
  'activity_log',
  'api_usage_log',
  'api_usage_daily_rollups',
  'cron_job_runs',
  'service_health_snapshots',
  'database_cleanup_runs'
);

UPDATE public.database_retention_policies
SET
  app_status = 'archive',
  consolidation_group = 'database_hygiene',
  category = 'Archive / cold storage',
  architecture_note = 'Cold archive for approved cleanup. Keep it separate so cleanup remains reversible.',
  updated_at = now()
WHERE table_name = 'database_row_archive';

-- Future or mostly empty feature areas. These may be right for the roadmap, but they should not distract daily operations yet.
UPDATE public.database_retention_policies
SET
  app_status = 'future_placeholder',
  architecture_note = 'Roadmap or mostly empty table. Keep visible, but do not let Jarvis treat it as authoritative until the workflow is fully wired.',
  updated_at = now()
WHERE table_name IN (
  'permit_applications',
  'permit_authorities',
  'preinstall_surveys',
  'warranty_registrations',
  'follow_up_inquiries',
  'message_sequences',
  'meta_audience_syncs',
  'meta_audiences',
  'portal_requests',
  'referral_codes',
  'referrals',
  'profit_kpi_targets',
  'weather_sms_codes'
);

-- Supply-house and vendor operations.
UPDATE public.database_retention_policies
SET
  app_status = CASE WHEN table_name IN ('supply_houses', 'supply_house_locations', 'vendor_contacts') THEN 'current' ELSE 'future_placeholder' END,
  consolidation_group = 'vendors_parts_supply',
  category = 'Vendors, parts, and supply houses',
  business_use = 'Supply-house, vendor, part lookup, ordering, or procurement support.',
  architecture_note = CASE
    WHEN table_name IN ('supply_houses', 'supply_house_locations', 'vendor_contacts')
      THEN 'Current vendor/supply reference data. Keep.'
    ELSE 'Ordering/procurement workflow table. Keep visible, but wire completely before Jarvis relies on it.'
  END,
  updated_at = now()
WHERE table_name IN (
  'supply_houses',
  'supply_house_locations',
  'vendor_contacts',
  'vendor_notes',
  'ce_order_items',
  'part_supply_house_numbers',
  'parts_orders',
  'pending_vendor_contacts',
  'job_invoices'
);

-- Technician forms and payroll. This is live-ish, but should be rationalized around the universal tech flow.
UPDATE public.database_retention_policies
SET
  app_status = CASE WHEN table_name IN ('tech_forms', 'tech_form_responses', 'tech_form_photos') THEN 'current' ELSE 'review' END,
  consolidation_group = 'technician_field_work',
  category = 'Technician forms and payroll',
  business_use = 'Technician forms, form responses, field photos, time tracking, or paysheet records.',
  architecture_note = 'Review alongside the universal tech workflow. Forms and photos are useful, but the office/NOW feed should read from a single tech-work summary view.',
  updated_at = now()
WHERE table_name IN (
  'tech_forms',
  'tech_form_responses',
  'tech_form_photos',
  'tech_form_fields',
  'tech_form_versions',
  'time_entries',
  'paysheet_entries'
);
