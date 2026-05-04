
-- Enhance plan templates with tiers and perks
ALTER TABLE maintenance_plan_templates
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'silver',
  ADD COLUMN IF NOT EXISTS perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#94a3b8';

-- Track every perk usage
CREATE TABLE public.plan_perk_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.service_agreements(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  perk_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  job_id uuid REFERENCES public.jobs(id),
  applied_discount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_perk_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage plan_perk_usage"
  ON public.plan_perk_usage FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read plan_perk_usage"
  ON public.plan_perk_usage FOR SELECT TO anon
  USING (true);
