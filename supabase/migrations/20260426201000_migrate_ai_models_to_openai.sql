-- Move AI model configuration away from old Gemini-era model names.

alter table public.ai_model_config
  alter column model set default 'gpt-5-mini';

insert into public.ai_model_config (task_key, label, model)
values
  ('copilot_chat', 'Copilot Chat', 'gpt-5-mini'),
  ('daily_briefing', 'Daily Briefing', 'gpt-5-mini'),
  ('email_classification', 'Email Classification', 'gpt-5-mini'),
  ('vision_extraction', 'Vision / Document OCR', 'gpt-5-mini'),
  ('sms_auto_reply', 'SMS Auto-Reply', 'gpt-5-mini'),
  ('customer_parsing', 'Customer Parsing', 'gpt-5-mini'),
  ('tech_form', 'Field Assistant', 'gpt-5-mini'),
  ('portal_chat', 'Portal Chat', 'gpt-5-mini'),
  ('follow_up', 'Follow-Up Check-In', 'gpt-5-mini'),
  ('repair_quote', 'Repair Quoting', 'gpt-5-mini'),
  ('call_todo_extraction', 'Call Todo Extraction', 'gpt-5-mini')
on conflict (task_key) do update
set model = case
      when public.ai_model_config.model ilike 'google/%' then 'gpt-5-mini'
      when public.ai_model_config.model ilike 'gemini%' then 'gpt-5-mini'
      when public.ai_model_config.model ilike 'openai/%' then replace(public.ai_model_config.model, 'openai/', '')
      else public.ai_model_config.model
    end,
    label = excluded.label,
    updated_at = now();

alter table public.profiles
  alter column preferred_model set default 'gpt-5-mini';

update public.profiles
set preferred_model = 'gpt-5-mini'
where preferred_model is null
   or preferred_model ilike 'google/%'
   or preferred_model ilike 'gemini%';
