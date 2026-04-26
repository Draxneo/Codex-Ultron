ALTER TABLE public.call_log
ADD COLUMN IF NOT EXISTS call_extraction jsonb DEFAULT NULL;

COMMENT ON COLUMN public.call_log.call_extraction IS 'Structured data extracted by summarize-call: name, address, service_type, urgency, scheduling, etc.';