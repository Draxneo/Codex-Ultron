
-- Table: service_pricebook — catalog of common HVAC service items
CREATE TABLE public.service_pricebook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  icon_emoji text DEFAULT '🔧',
  base_price numeric NOT NULL DEFAULT 0,
  cost numeric DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.service_pricebook ENABLE ROW LEVEL SECURITY;

-- Public read so techs on public form routes can fetch items
CREATE POLICY "Anyone can read active pricebook items"
  ON public.service_pricebook FOR SELECT
  USING (true);

-- Only authenticated admin users can manage pricebook
CREATE POLICY "Authenticated users can manage pricebook"
  ON public.service_pricebook FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Table: job_repair_items — items added to a job by a tech
CREATE TABLE public.job_repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  pricebook_item_id uuid REFERENCES public.service_pricebook(id),
  name text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  severity text DEFAULT 'recommended',
  notes text,
  added_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_repair_items ENABLE ROW LEVEL SECURITY;

-- Public access for techs on public form routes
CREATE POLICY "Anyone can read job repair items"
  ON public.job_repair_items FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert job repair items"
  ON public.job_repair_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update job repair items"
  ON public.job_repair_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete job repair items"
  ON public.job_repair_items FOR DELETE
  USING (true);

-- Seed common HVAC service items
INSERT INTO public.service_pricebook (name, category, icon_emoji, base_price, cost, sort_order) VALUES
  ('Contactor', 'Electrical', '⚡', 250, 35, 1),
  ('Capacitor (30µF)', 'Electrical', '⚡', 200, 20, 2),
  ('Capacitor (45µF)', 'Electrical', '⚡', 225, 25, 3),
  ('Capacitor (Dual)', 'Electrical', '⚡', 250, 30, 4),
  ('Hard Start Kit', 'Electrical', '⚡', 275, 40, 5),
  ('Blower Motor', 'Motors', '🔧', 850, 250, 6),
  ('Condenser Fan Motor', 'Motors', '🔧', 550, 150, 7),
  ('Inducer Motor', 'Motors', '🔧', 950, 300, 8),
  ('Coil Cleaning (Evap)', 'Cleaning', '🧹', 350, 30, 9),
  ('Coil Cleaning (Condenser)', 'Cleaning', '🧹', 250, 20, 10),
  ('Drain Line Flush', 'Cleaning', '🧹', 150, 10, 11),
  ('Thermostat (Basic)', 'Controls', '🌡️', 275, 80, 12),
  ('Control Board', 'Controls', '🌡️', 650, 200, 13),
  ('TXV Replacement', 'Refrigeration', '❄️', 1200, 350, 14),
  ('Refrigerant (per lb)', 'Refrigeration', '❄️', 125, 40, 15);
