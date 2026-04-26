
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pay_category text;

ALTER TABLE public.paysheet_entries ADD COLUMN IF NOT EXISTS pay_category text;
ALTER TABLE public.paysheet_entries ADD COLUMN IF NOT EXISTS rate_type text DEFAULT 'flat';
