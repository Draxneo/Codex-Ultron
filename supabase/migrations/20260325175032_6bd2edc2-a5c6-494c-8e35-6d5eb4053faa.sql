
-- New table: service_repair_items
CREATE TABLE public.service_repair_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'recommended',
  parts_cost NUMERIC NOT NULL DEFAULT 0,
  labor_cost NUMERIC NOT NULL DEFAULT 0,
  suggested_price NUMERIC NOT NULL DEFAULT 0,
  final_price NUMERIC NOT NULL DEFAULT 0,
  approved BOOLEAN NOT NULL DEFAULT false,
  pay_category TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_repair_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage service_repair_items"
  ON public.service_repair_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anon users can read service_repair_items"
  ON public.service_repair_items FOR SELECT TO anon USING (true);

-- New table: profit_kpi_targets
CREATE TABLE public.profit_kpi_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  target_margin_pct NUMERIC NOT NULL DEFAULT 65,
  min_margin_pct NUMERIC NOT NULL DEFAULT 50,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profit_kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage profit_kpi_targets"
  ON public.profit_kpi_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add cost/profit columns to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS parts_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_pct NUMERIC DEFAULT 0;

-- Seed default KPI targets
INSERT INTO public.profit_kpi_targets (category, target_margin_pct, min_margin_pct, notes) VALUES
  ('service', 65, 50, 'Service / Repair'),
  ('complete_install', 45, 35, 'Complete Install'),
  ('one_off_maintenance', 70, 55, 'One-Off Maintenance'),
  ('plan_visit', 75, 60, 'Service Plan Visit'),
  ('condenser_sale', 35, 25, 'Condenser Sale'),
  ('coil_sale', 35, 25, 'Coil Sale'),
  ('furnace_sale', 35, 25, 'Furnace Sale'),
  ('air_handler_sale', 35, 25, 'Air Handler Sale'),
  ('complete_system_sale', 35, 25, 'Complete System Sale'),
  ('condenser_install', 40, 30, 'Condenser Install'),
  ('coil_install', 40, 30, 'Coil Install'),
  ('furnace_install', 40, 30, 'Furnace Install'),
  ('air_handler_install', 40, 30, 'Air Handler Install'),
  ('plan_sale', 65, 50, 'Service Plan Sale'),
  ('diagnostic', 80, 65, 'Diagnostic / No-Repair')
ON CONFLICT (category) DO NOTHING;
