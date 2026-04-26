
-- Add related_vendor_id to emails
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS related_vendor_id uuid REFERENCES public.supply_houses(id);
CREATE INDEX IF NOT EXISTS idx_emails_vendor ON public.emails(related_vendor_id);

-- Add related_vendor_id to sms_log
ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS related_vendor_id uuid REFERENCES public.supply_houses(id);
CREATE INDEX IF NOT EXISTS idx_sms_vendor ON public.sms_log(related_vendor_id);

-- Add related_vendor_id to call_log
ALTER TABLE public.call_log ADD COLUMN IF NOT EXISTS related_vendor_id uuid REFERENCES public.supply_houses(id);
CREATE INDEX IF NOT EXISTS idx_calls_vendor ON public.call_log(related_vendor_id);
