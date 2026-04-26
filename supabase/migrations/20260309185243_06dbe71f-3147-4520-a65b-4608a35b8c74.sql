ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT NULL;
ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS error_code text DEFAULT NULL;