CREATE TABLE public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number text NOT NULL,
  body text NOT NULL,
  twilio_sid text,
  related_job_id uuid REFERENCES public.jobs(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sms_log" ON public.sms_log FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_log;