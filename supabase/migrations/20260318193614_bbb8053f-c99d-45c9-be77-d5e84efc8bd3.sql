
-- Fix #1/#2: Link jobs back to estimates for traceability
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.estimates(id);

-- Fix #3: Track when review request was sent
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;
