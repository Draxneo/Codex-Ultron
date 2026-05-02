-- Scope IVR test mode to each company's IVR config.
-- The old global company_settings.ivr_test_mode made Carnes and FIX share one switch.

ALTER TABLE public.ivr_config
  ADD COLUMN IF NOT EXISTS ivr_test_mode boolean NOT NULL DEFAULT false;

UPDATE public.ivr_config c
SET ivr_test_mode = CASE WHEN lower(coalesce(s.value, 'false')) = 'true' THEN true ELSE false END
FROM public.company_settings s
WHERE s.key = 'ivr_test_mode'
  AND c.is_default = true
  AND c.ivr_test_mode = false;

COMMENT ON COLUMN public.ivr_config.ivr_test_mode IS
  'When true, this specific company IVR bypasses the menu and rings registered clients directly for testing.';
