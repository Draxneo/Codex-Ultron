
ALTER TABLE public.customer_invoices
ADD COLUMN public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
