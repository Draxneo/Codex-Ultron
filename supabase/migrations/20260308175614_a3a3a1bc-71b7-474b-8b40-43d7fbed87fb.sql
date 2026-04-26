
CREATE TABLE public.email_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  title text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

ALTER TABLE public.email_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read email_actions" ON public.email_actions FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert email_actions" ON public.email_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update email_actions" ON public.email_actions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete email_actions" ON public.email_actions FOR DELETE USING (true);

CREATE INDEX idx_email_actions_email_id ON public.email_actions(email_id);
CREATE INDEX idx_email_actions_status ON public.email_actions(status);
