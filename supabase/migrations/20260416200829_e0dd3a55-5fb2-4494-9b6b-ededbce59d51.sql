-- Add 24/7 Answering Service overflow configuration to IVR
ALTER TABLE public.ivr_config
  ADD COLUMN IF NOT EXISTS answering_service_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS answering_service_number text,
  ADD COLUMN IF NOT EXISTS answering_service_label text DEFAULT 'Answering Service',
  ADD COLUMN IF NOT EXISTS overflow_on_busy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS overflow_on_no_answer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS overflow_after_hours boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS overflow_ring_seconds_before_handoff integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS overflow_after_hours_skip_voicemail boolean NOT NULL DEFAULT true;

-- Seed the answering service number provided by user (only if not already set)
UPDATE public.ivr_config
SET answering_service_number = '+12106378332',
    answering_service_label = 'Answering Service',
    answering_service_enabled = true
WHERE answering_service_number IS NULL OR answering_service_number = '';