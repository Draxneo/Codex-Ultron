
-- Add slug column to sms_templates
ALTER TABLE public.sms_templates ADD COLUMN IF NOT EXISTS slug text;

-- Add unique constraint on slug
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_slug_unique UNIQUE (slug);

-- Backfill slugs on existing workflow templates
UPDATE public.sms_templates SET slug = 'appointment_confirmation' WHERE name = 'Appointment Confirmation' AND category = 'workflow';
UPDATE public.sms_templates SET slug = 'tech_dispatch' WHERE name = 'Tech Dispatch' AND category = 'workflow';

-- Backfill slugs on other existing templates (snake_case of name)
UPDATE public.sms_templates SET slug = 'estimate_day_14' WHERE name = 'Estimate Day 14 Final Outreach';
UPDATE public.sms_templates SET slug = 'estimate_day_3' WHERE name = 'Estimate Day 3 Check-In';
UPDATE public.sms_templates SET slug = 'quote_summary' WHERE name = 'Quote Summary';
UPDATE public.sms_templates SET slug = 'review_request' WHERE name = 'Review Request';
UPDATE public.sms_templates SET slug = 'daily_schedule' WHERE name = 'Daily Schedule';
UPDATE public.sms_templates SET slug = 'financing_mention' WHERE name = 'Financing Mention';
UPDATE public.sms_templates SET slug = 'install_job_assignment' WHERE name = 'Install Job Assignment';
UPDATE public.sms_templates SET slug = 'install_specs' WHERE name = 'Install Specs';
UPDATE public.sms_templates SET slug = 'overdue_task_reminder' WHERE name = 'Overdue Task Reminder';
UPDATE public.sms_templates SET slug = 'service_call_assignment' WHERE name = 'Service Call Assignment';

-- Seed the 3 missing workflow templates
INSERT INTO public.sms_templates (name, slug, category, template_body, is_active)
VALUES
(
  'Appointment Reminder (Same Day)',
  'appointment_reminder_sameday',
  'workflow',
  'Good morning {{first_name}}! Your {{job_type}} appointment is today. Reply C to confirm or R to reschedule.{{a2p_footer}}',
  true
),
(
  'Install Checklist (to Tech)',
  'tech_install_checklist',
  'workflow',
  'Job #{{job_number}} — please complete the install pre-checklist before arriving at {{address}}.',
  true
),
(
  'ETA / On My Way',
  'eta_to_customer',
  'workflow',
  'Hi {{first_name}}, {{tech_name}} is on the way and will arrive shortly. Reply if you have any questions.{{a2p_footer}}',
  true
)
ON CONFLICT (slug) DO NOTHING;
