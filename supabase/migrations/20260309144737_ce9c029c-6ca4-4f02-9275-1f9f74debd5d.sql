ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'unknown';