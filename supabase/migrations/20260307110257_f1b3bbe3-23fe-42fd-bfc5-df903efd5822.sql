
-- Create maintenance plan templates table
CREATE TABLE public.maintenance_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_type text NOT NULL DEFAULT 'annual',
  frequency text NOT NULL DEFAULT 'biannual',
  price numeric NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to maintenance_plan_templates" ON public.maintenance_plan_templates FOR ALL USING (true) WITH CHECK (true);

-- Add payment plan columns to customer_invoices
ALTER TABLE public.customer_invoices
  ADD COLUMN payment_plan_count integer,
  ADD COLUMN payment_plan_interval text;
