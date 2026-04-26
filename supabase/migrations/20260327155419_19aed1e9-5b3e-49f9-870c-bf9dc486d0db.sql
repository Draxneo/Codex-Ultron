CREATE TABLE public.deposit_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL UNIQUE,
  label text NOT NULL,
  draws jsonb NOT NULL DEFAULT '[{"percent": 50, "label": "Deposit"}]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deposit_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read deposit_schedules"
  ON public.deposit_schedules FOR SELECT TO authenticated USING (true);

INSERT INTO public.deposit_schedules (job_type, label, draws) VALUES
  ('install', 'Standard Install', '[{"percent": 50, "label": "Deposit"}]'::jsonb),
  ('rough_in', 'Rough-In / New Construction', '[{"percent": 50, "label": "Deposit"}, {"percent": 40, "label": "Rough-In Draw"}, {"percent": 10, "label": "Final Payment"}]'::jsonb);