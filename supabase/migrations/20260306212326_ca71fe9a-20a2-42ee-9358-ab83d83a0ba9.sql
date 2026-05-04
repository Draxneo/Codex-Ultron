
-- Add new columns to emails table
ALTER TABLE public.emails 
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_trash boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- Allow DELETE on emails
CREATE POLICY "Authenticated can delete emails" ON public.emails
  FOR DELETE TO authenticated USING (true);

-- Email labels table
CREATE TABLE public.email_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read email_labels" ON public.email_labels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage email_labels" ON public.email_labels
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

-- Seed system labels
INSERT INTO public.email_labels (name, color, is_system, sort_order) VALUES
  ('Inbox', '#3b82f6', true, 0),
  ('Sent', '#6b7280', true, 1),
  ('Drafts', '#f59e0b', true, 2),
  ('Starred', '#eab308', true, 3),
  ('Trash', '#ef4444', true, 4),
  ('Spam', '#dc2626', true, 5);

-- Email label assignments (many-to-many)
CREATE TABLE public.email_label_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email_id, label_id)
);

ALTER TABLE public.email_label_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage label assignments" ON public.email_label_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Email contacts (auto-populated address book)
CREATE TABLE public.email_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL UNIQUE,
  display_name text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  last_emailed_at timestamptz,
  email_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage email_contacts" ON public.email_contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Email signatures (per-user)
CREATE TABLE public.email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  html_content text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own signatures" ON public.email_signatures
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Email drafts (auto-saved)
CREATE TABLE public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_address text NOT NULL DEFAULT '',
  cc_address text,
  bcc_address text,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  in_reply_to text,
  thread_id text,
  signature_id uuid REFERENCES public.email_signatures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drafts" ON public.email_drafts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Storage bucket for email attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('email-attachments', 'email-attachments', false);

CREATE POLICY "Authenticated can upload email attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'email-attachments');

CREATE POLICY "Authenticated can read email attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'email-attachments');
