CREATE TABLE IF NOT EXISTS public.intake_thread_status (
  channel text NOT NULL CHECK (channel IN ('sms', 'call')),
  phone_last10 text NOT NULL CHECK (length(phone_last10) = 10),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handled')),
  handled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_by_name text,
  handled_at timestamptz,
  last_signal_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, phone_last10)
);

ALTER TABLE public.intake_thread_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read intake thread status" ON public.intake_thread_status;
CREATE POLICY "Authenticated users can read intake thread status"
  ON public.intake_thread_status FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage intake thread status" ON public.intake_thread_status;
CREATE POLICY "Authenticated users can manage intake thread status"
  ON public.intake_thread_status FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'office'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'office'::app_role));

CREATE INDEX IF NOT EXISTS intake_thread_status_status_idx
  ON public.intake_thread_status (status, updated_at DESC);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intake_thread_status;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
