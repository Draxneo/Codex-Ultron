
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispatch_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS completion_form_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS photos_uploaded_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_registered_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS rebate_submitted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS inspection_scheduled_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS inspection_passed_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payment_collected_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS follow_up_completed_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS maint_report_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS next_visit_scheduled_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
