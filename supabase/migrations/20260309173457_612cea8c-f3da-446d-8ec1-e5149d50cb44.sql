
CREATE TABLE public.call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'inbound',
  phone_number text NOT NULL,
  duration_seconds integer,
  status text NOT NULL DEFAULT 'initiated',
  twilio_sid text,
  related_job_id uuid REFERENCES public.jobs(id),
  contact_name text,
  contact_type text NOT NULL DEFAULT 'unknown',
  recording_url text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);

ALTER TABLE public.call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to call_log"
  ON public.call_log FOR ALL TO public
  USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_log;
