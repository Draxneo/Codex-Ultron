
-- Add workflow timestamp columns to estimates table for the estimate workflow engine
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS dispatch_sent_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS on_my_way_sent_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS completion_form_sent_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS brochure_sent boolean DEFAULT false;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
