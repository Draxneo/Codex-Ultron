INSERT INTO public.company_settings (key, value)
VALUES
  ('a2p_footer', 'Reply STOP to opt out.'),
  ('google_lsa_relay_numbers', ''),
  ('google_ads_relay_numbers', '')
ON CONFLICT (key) DO NOTHING;

WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY slug
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM public.sms_templates
  WHERE slug IS NOT NULL
)
DELETE FROM public.sms_templates template
USING ranked
WHERE template.ctid = ranked.ctid
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sms_templates_slug_unique_idx
ON public.sms_templates (slug);

INSERT INTO public.sms_templates (name, slug, category, template_body, is_active)
VALUES
(
  'Appointment Confirmation',
  'appointment_confirmation',
  'workflow',
  'Hi {{first_name}}, you are all set with {{company_name}} for {{scheduled_date}} between {{time_window}}. You will get a 30-minute heads up when we are on the way. If our family needs a gate code, pet note, or anything else to take good care of yours, just reply here. {{a2p_footer}}',
  true
),
(
  'Appointment Reminder - Day Before',
  'appointment_reminder_day_before',
  'workflow',
  'Hi {{first_name}}, just a friendly reminder from the Carnes family: your {{job_type}} appointment is {{date_label}} between {{time_window}}. You will get a 30-minute heads up when we are on the way. Reply C to confirm, R to reschedule, or send any gate code, pet note, or access instructions here. {{a2p_footer}}',
  true
),
(
  'Appointment Reminder - Same Day',
  'appointment_reminder_sameday',
  'workflow',
  'Good morning {{first_name}}, the Carnes family has you on the schedule today between {{time_window}}. You will get a 30-minute heads up when we are on the way. Reply here with any gate code, pet note, or access instructions. {{a2p_footer}}',
  true
),
(
  'ETA / On My Way',
  'eta_to_customer',
  'workflow',
  'Hi {{first_name}}, {{tech_name}} with {{company_name}} is on the way. {{eta_text}} We appreciate you letting our family take care of yours today. Reply here if we need a gate code, pet note, or anything else before arrival. {{a2p_footer}}',
  true
),
(
  'Job Complete Thank You',
  'job_complete_thank_you',
  'workflow',
  'Hi {{first_name}}, thank you for letting our family serve yours today. Your visit is marked complete. We appreciate you choosing {{company_name}}, and we are always just a text away if you need us again. {{a2p_footer}}',
  true
),
(
  'Post-Call Thank You - Known Customer',
  'post_call_known_customer',
  'phone',
  'Hi {{customer_name}}, thanks for calling {{company_name}}. We appreciate you thinking of our family to help yours. If there is anything else you need to share, you can text us back here. {{a2p_footer}}',
  true
),
(
  'Post-Call Thank You - New Caller',
  'post_call_unknown_customer',
  'phone',
  'Thanks for calling {{company_name}}. We are a local family company, and we would be glad to help. Text us back here with your name, service address, best callback number, and anything else you want us to know. {{a2p_footer}}',
  true
),
(
  'Missed Call - During Hours',
  'missed_call_during_hours',
  'phone',
  'Hi, sorry we missed you. This is the Carnes family, and we will call you back as soon as we can. Need us sooner? Text us here with your name, service address, and what is going on. {{a2p_footer}}',
  true
),
(
  'Missed Call - After Hours',
  'missed_call_after_hours',
  'phone',
  'Hi, thanks for calling {{company_name}}. Our office is closed right now, but you can text us here with your name, service address, and what is going on. For emergencies, text EMERGENCY and our family will follow up as quickly as we can. {{a2p_footer}}',
  true
),
(
  'Google LSA Relay - Capture Real Phone',
  'google_lsa_relay_capture',
  'lead',
  'Thanks for reaching Carnes and Sons Air Conditioning. We are a local family company, and we want to make sure we can reach you directly. Google may hide your phone number in this thread, so please reply with your best callback number or text/call us at {{company_phone}}. {{a2p_footer}}',
  true
),
(
  'Review Request',
  'review_request',
  'workflow',
  'Hi {{first_name}}, thank you for letting our family take care of yours. If we earned it, would you mind leaving us a quick review? {{review_link}} {{a2p_footer}}',
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  template_body = EXCLUDED.template_body,
  is_active = EXCLUDED.is_active,
  updated_at = now();
