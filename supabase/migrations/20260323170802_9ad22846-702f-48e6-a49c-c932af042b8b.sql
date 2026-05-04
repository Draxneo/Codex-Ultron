
-- Parts orders table for tracking equipment/parts pickups
CREATE TABLE public.parts_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  supply_house_id uuid REFERENCES public.supply_houses(id) ON DELETE SET NULL,
  po_number text,
  description text,
  status text NOT NULL DEFAULT 'ordered',
  expected_arrival date,
  ordered_at timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.parts_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read parts_orders" ON public.parts_orders FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert parts_orders" ON public.parts_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update parts_orders" ON public.parts_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete parts_orders" ON public.parts_orders FOR DELETE TO authenticated USING (true);

-- Add pickup fields to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pickup_supply_house_id uuid REFERENCES public.supply_houses(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pickup_notes text;

-- Add PO number to customer_invoices
ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS po_number text;
