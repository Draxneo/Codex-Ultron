
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.customer_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  hcp_address_id text,
  address_type text NOT NULL DEFAULT 'billing',
  is_primary boolean NOT NULL DEFAULT false,
  street text,
  street_line_2 text,
  city text,
  state text,
  zip text,
  latitude text,
  longitude text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_addresses_hcp_address_id_key UNIQUE (hcp_address_id)
);

CREATE INDEX idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customer addresses"
  ON public.customer_addresses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert customer addresses"
  ON public.customer_addresses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update customer addresses"
  ON public.customer_addresses FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete customer addresses"
  ON public.customer_addresses FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
