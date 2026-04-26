
-- Customer invoices table
CREATE TABLE public.customer_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  sent_via TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoice line items
CREATE TABLE public.customer_invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES public.customer_invoices(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to customer_invoices" ON public.customer_invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to customer_invoice_items" ON public.customer_invoice_items FOR ALL USING (true) WITH CHECK (true);

-- Generate invoice numbers
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || LPAD(nextval('customer_invoice_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS public.customer_invoice_seq START WITH 1001;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON public.customer_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_invoice_number();
