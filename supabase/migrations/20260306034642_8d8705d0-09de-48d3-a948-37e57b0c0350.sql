
-- Service Agreements / Maintenance Plans
CREATE TABLE public.service_agreements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  plan_name text NOT NULL DEFAULT 'Standard Maintenance',
  plan_type text NOT NULL DEFAULT 'annual',
  frequency text NOT NULL DEFAULT 'biannual',
  price numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to service_agreements" ON public.service_agreements FOR ALL USING (true) WITH CHECK (true);

-- Customer Equipment History
CREATE TABLE public.customer_equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  equipment_type text NOT NULL DEFAULT 'ac',
  brand text,
  model_number text,
  serial_number text,
  install_date date,
  location_note text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to customer_equipment" ON public.customer_equipment FOR ALL USING (true) WITH CHECK (true);
