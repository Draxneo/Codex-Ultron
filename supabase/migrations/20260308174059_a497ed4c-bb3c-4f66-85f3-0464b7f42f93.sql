
-- Phase 2: Add snooze column to emails
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS snoozed_until timestamptz DEFAULT NULL;

-- Phase 2: Function to unsnooze emails past their snooze time
CREATE OR REPLACE FUNCTION public.unsnooze_emails()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.emails
  SET snoozed_until = NULL
  WHERE snoozed_until IS NOT NULL AND snoozed_until <= now();
$$;

-- Phase 3: Email snippets table
CREATE TABLE public.email_snippets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  shortcut text DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own snippets"
  ON public.email_snippets
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
