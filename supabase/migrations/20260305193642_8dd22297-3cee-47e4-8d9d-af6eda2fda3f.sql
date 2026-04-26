
-- Create customers table
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name text,
  last_name text,
  company text,
  email text,
  phone text,
  mobile_phone text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  tags text[] DEFAULT '{}',
  hcp_customer_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add customer_id FK to jobs table
ALTER TABLE public.jobs ADD COLUMN customer_id uuid REFERENCES public.customers(id);

-- Add customer_id FK to estimates table
ALTER TABLE public.estimates ADD COLUMN customer_id uuid REFERENCES public.customers(id);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS: all authenticated users can read customers
CREATE POLICY "Authenticated can read customers" ON public.customers
  FOR SELECT TO authenticated USING (true);

-- RLS: admins and office can manage customers
CREATE POLICY "Admins can manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));
