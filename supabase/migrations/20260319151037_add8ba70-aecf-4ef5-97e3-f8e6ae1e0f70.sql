
ALTER TABLE public.jobs ADD COLUMN payment_method text;
ALTER TABLE public.jobs ADD COLUMN finance_email text;
ALTER TABLE public.jobs ADD COLUMN finance_dob date;
ALTER TABLE public.jobs ADD COLUMN finance_paperwork_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN preinstall_sent_at timestamptz;
