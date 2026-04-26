
-- Time entries table for form-based time tracking
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  tech_form_id uuid NOT NULL,
  work_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  arrived_at timestamptz NOT NULL,
  departed_at timestamptz,
  time_on_site_min numeric DEFAULT 0,
  drive_time_min numeric,
  total_hours numeric,
  source text NOT NULL DEFAULT 'form',
  override_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read time_entries"
  ON public.time_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert time_entries"
  ON public.time_entries FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update time_entries"
  ON public.time_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Add hourly_rate and pay_model to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_model text DEFAULT 'commission';

-- Add hourly_amount, commission_amount, hours_worked to paysheet_entries
ALTER TABLE public.paysheet_entries
  ADD COLUMN IF NOT EXISTS hourly_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_worked numeric;
