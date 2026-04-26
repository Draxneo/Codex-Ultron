
-- IVR configuration (single-row)
CREATE TABLE public.ivr_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  greeting_text text NOT NULL DEFAULT 'Thank you for calling. Please listen to the following options.',
  after_hours_greeting text NOT NULL DEFAULT 'Thank you for calling. We are currently closed. Please leave a message after the tone.',
  voicemail_greeting text NOT NULL DEFAULT 'Please leave a message after the tone and we will return your call.',
  business_hours_start text NOT NULL DEFAULT '08:00',
  business_hours_end text NOT NULL DEFAULT '17:00',
  business_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  timezone text NOT NULL DEFAULT 'America/Chicago',
  voicemail_enabled boolean NOT NULL DEFAULT true,
  ring_timeout_seconds integer NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ivr_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ivr_config" ON public.ivr_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read ivr_config" ON public.ivr_config
  FOR SELECT TO authenticated
  USING (true);

-- Allow edge functions (anon) to read config
CREATE POLICY "Anon can read ivr_config" ON public.ivr_config
  FOR SELECT TO anon
  USING (true);

-- IVR menu options
CREATE TABLE public.ivr_menu_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digit text NOT NULL,
  label text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'forward_client',
  forward_to text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(digit)
);

ALTER TABLE public.ivr_menu_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ivr_menu_options" ON public.ivr_menu_options
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read ivr_menu_options" ON public.ivr_menu_options
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anon can read ivr_menu_options" ON public.ivr_menu_options
  FOR SELECT TO anon
  USING (true);

-- Voicemails table
CREATE TABLE public.voicemails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid REFERENCES public.call_log(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  contact_name text,
  contact_type text NOT NULL DEFAULT 'unknown',
  recording_url text,
  recording_sid text,
  duration_seconds integer,
  transcription text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voicemails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage voicemails" ON public.voicemails
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can insert voicemails" ON public.voicemails
  FOR INSERT TO anon
  WITH CHECK (true);

-- Enable realtime for voicemails
ALTER PUBLICATION supabase_realtime ADD TABLE public.voicemails;

-- Seed default IVR config
INSERT INTO public.ivr_config (id) VALUES (gen_random_uuid());
