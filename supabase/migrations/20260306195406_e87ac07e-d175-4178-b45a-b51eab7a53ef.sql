
-- emails table for inbound/outbound email storage
CREATE TABLE public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  in_reply_to text,
  thread_id text,
  from_address text NOT NULL,
  from_name text,
  to_address text NOT NULL,
  cc_address text,
  subject text,
  body_text text,
  body_html text,
  snippet text,
  is_read boolean NOT NULL DEFAULT false,
  is_outbound boolean NOT NULL DEFAULT false,
  inbox_type text NOT NULL DEFAULT 'shared',
  owner_user_id uuid,
  received_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all emails"
  ON public.emails FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert emails"
  ON public.emails FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update emails"
  ON public.emails FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can insert emails"
  ON public.emails FOR INSERT TO anon
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.emails;

-- email_rules table
CREATE TABLE public.email_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_pattern text NOT NULL,
  action_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read email_rules"
  ON public.email_rules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage email_rules"
  ON public.email_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
