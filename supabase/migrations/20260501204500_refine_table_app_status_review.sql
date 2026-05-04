-- Small follow-up after inspecting the app-fit buckets.

UPDATE public.database_retention_policies
SET
  app_status = 'runtime_cache',
  consolidation_group = 'customer_portal_access',
  category = 'Marketing and customer portal',
  business_use = 'Short-lived customer portal or intake access token/session/invite.',
  architecture_note = 'Temporary access state. Good to keep separate and expire; not customer history.',
  updated_at = now()
WHERE table_name IN (
  'customer_intake_tokens',
  'customer_portal_codes',
  'customer_portal_invites',
  'customer_portal_sessions'
);

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'technician_field_work',
  category = 'Technician forms and payroll',
  business_use = 'Technician form schema/version configuration used by field workflows.',
  architecture_note = 'Current tech workflow configuration. Keep it, but expose office-facing results through one tech-work summary view.',
  retention_action = 'keep',
  retention_days = NULL,
  enabled = false,
  updated_at = now()
WHERE table_name IN ('tech_form_fields', 'tech_form_versions');

UPDATE public.database_retention_policies
SET
  app_status = 'current',
  consolidation_group = 'customer_communications',
  category = 'Communications / phone system',
  business_use = 'Optional reaction/read-feedback layer for SMS conversations.',
  architecture_note = 'Small communication helper table. Keep separate from sms_log so the SMS history stays clean.',
  updated_at = now()
WHERE table_name = 'sms_reactions';

UPDATE public.database_retention_policies
SET
  consolidation_group = 'closeout_workflows',
  updated_at = now()
WHERE table_name IN (
  'permit_applications',
  'permit_authorities',
  'preinstall_surveys',
  'warranty_registrations'
);

UPDATE public.database_retention_policies
SET
  consolidation_group = 'lead_followup_marketing',
  updated_at = now()
WHERE table_name IN (
  'follow_up_inquiries',
  'message_sequences',
  'meta_audience_syncs',
  'meta_audiences',
  'portal_requests',
  'referral_codes',
  'referrals',
  'weather_sms_codes'
);
