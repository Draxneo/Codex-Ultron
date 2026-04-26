
CREATE TABLE public.sms_intake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  current_step text NOT NULL DEFAULT 'greeting',
  collected_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_intake_phone ON public.sms_intake_sessions(phone_number);

ALTER TABLE public.sms_intake_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sms_intake_sessions"
ON public.sms_intake_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
