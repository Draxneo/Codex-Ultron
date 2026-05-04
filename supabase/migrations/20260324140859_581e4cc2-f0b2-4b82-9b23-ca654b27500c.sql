
CREATE TABLE public.ai_model_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key text UNIQUE NOT NULL,
  label text NOT NULL,
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.ai_model_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update" ON public.ai_model_config FOR UPDATE TO authenticated USING (true);

INSERT INTO public.ai_model_config (task_key, label, model) VALUES
  ('copilot_chat', 'Copilot Chat', 'google/gemini-3-flash-preview'),
  ('daily_briefing', 'Daily Briefing', 'google/gemini-3-flash-preview'),
  ('email_classification', 'Email Classification', 'google/gemini-2.5-flash'),
  ('vision_extraction', 'Vision / Document OCR', 'google/gemini-2.5-flash'),
  ('sms_auto_reply', 'SMS Auto-Reply', 'google/gemini-2.5-flash'),
  ('customer_parsing', 'Customer Parsing', 'google/gemini-3-flash-preview'),
  ('tech_form', 'Field Assistant', 'google/gemini-3-flash-preview'),
  ('portal_chat', 'Portal Chat', 'google/gemini-3-flash-preview'),
  ('follow_up', 'Follow-Up Check-In', 'google/gemini-2.5-flash-lite');
