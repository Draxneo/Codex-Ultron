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
  'brand_voice_family_service',
  'Carnes and Sons Brand Voice',
  'core',
  'Carnes and Sons brand voice: personal service from our family to theirs.

JARVIS should write customer-facing SMS, call follow-ups, quote follow-ups, reminders, and customer drafts like a trusted local neighbor, not a stiff corporate help desk.

Voice rules:
- Warm, plainspoken, and personal.
- Mention family naturally when it fits: "our family taking care of yours", "the Carnes family", or "letting our family serve yours".
- Keep texts short and useful. Do not overdo sentiment or sound fake.
- Be friendly and human while still clear about the action: confirm, reschedule, send gate code, reply with address, review quote, approve payment, or call back.
- Avoid cold phrases like "your request has been received", "service ticket", "per our records", or "we appreciate your business" when a warmer family phrase fits.
- Customer-facing actions still require human approval unless they are deterministic operational texts already approved by workflow.',
  null,
  true,
  true,
  13
) on conflict (slug) do update set
  title = excluded.title,
  category = excluded.category,
  content = excluded.content,
  route_scope = excluded.route_scope,
  is_active = true,
  is_locked = true,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.agent_instructions (label, slug, content, is_active, sort_order)
values (
  'SMS Brand Voice - Family Service',
  'sms_brand_voice_family_service',
  'When drafting or suggesting customer SMS, use Carnes and Sons brand voice: personal service from our family to theirs. Sound like a trusted local neighbor. Keep messages short, warm, useful, and human. Mention family naturally when appropriate, but do not overdo it. Avoid stiff corporate language.',
  true,
  35
) on conflict (slug) do update set
  label = excluded.label,
  content = excluded.content,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.company_settings
set value = 'Hi, sorry we missed you. This is the Carnes family, and we will call you back as soon as we can. Need us sooner? Text us here with your name, service address, and what is going on.',
    updated_at = now()
where key = 'missed_call_sms_during_hours';

update public.company_settings
set value = 'Hi, thanks for calling Carnes and Sons. Our office is closed right now, but you can text us here with your name, service address, and what is going on. For emergencies, text EMERGENCY and our family will follow up as quickly as we can.',
    updated_at = now()
where key = 'missed_call_sms_after_hours';

update public.company_settings
set value = 'Hi {{customer_name}}, thanks for calling Carnes and Sons. We appreciate you thinking of our family to help yours. If there is anything else you need to share, you can text us back here.',
    updated_at = now()
where key = 'post_call_sms_customer' and coalesce(value, '') <> '';

update public.company_settings
set value = 'Thanks for calling Carnes and Sons. We are a local family company, and we would be glad to help. Text us back here with your name, service address, best callback number, and anything else you want us to know.',
    updated_at = now()
where key = 'post_call_sms_unknown' and coalesce(value, '') <> '';

update public.ivr_menu_options
set dept_missed_call_sms = 'Hi, sorry we missed you. This is the Carnes family, and we will call you back as soon as we can. Need us sooner? Text us here with your name, service address, and what is going on.',
    updated_at = now()
where coalesce(dept_missed_call_sms, '') <> '';

update public.ivr_menu_options
set dept_no_vm_missed_call_sms = 'Hi, sorry we missed you. This is the Carnes family, and we will call you back as soon as we can. Need us sooner? Text us here with your name, service address, and what is going on.',
    updated_at = now()
where coalesce(dept_no_vm_missed_call_sms, '') <> '';

update public.ivr_menu_options
set dept_post_call_sms = 'Thanks for calling Carnes and Sons. We appreciate you thinking of our family to help yours. If there is anything else you need to share, you can text us back here.',
    updated_at = now()
where coalesce(dept_post_call_sms, '') <> '';
