CREATE TABLE public.copilot_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to copilot_training" ON public.copilot_training
  FOR ALL USING (true) WITH CHECK (true);

-- Seed with default training parameters
INSERT INTO public.copilot_training (category, content) VALUES
  ('response_times', 'Permits should be pulled at least 2 business days before install date. Equipment should be ordered 3+ days before install. City inspection should be scheduled within 2 days after install completion.'),
  ('quality_standards', 'Every install job MUST have: final photos uploaded within 1 day, warranty registered within 7 days, and permit closeout within 5 days. No exceptions.'),
  ('communication', 'Customer follow-up calls should happen within 7 days of install. If a customer declines repair, follow up in 14 days. Invoices must be sent within 1 business day of service completion.'),
  ('team_performance', 'A smooth day means: zero overdue required tasks, all pre-job tasks completed before job date, and post-job tasks started same day as job completion. Aim for 90%+ on-time task completion rate.'),
  ('priorities', 'Priority order: 1) Required overdue tasks 2) Tasks due today 3) Pre-job tasks for upcoming jobs 4) Post-job tasks within window 5) Optional follow-ups. Install jobs always take priority over service for task completion.');