ALTER TABLE public.estimate_responses 
  ADD COLUMN IF NOT EXISTS selected_tier text,
  ADD COLUMN IF NOT EXISTS selected_addons jsonb;