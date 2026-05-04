
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS classification_confidence text;

CREATE TABLE public.classification_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid REFERENCES public.emails(id) ON DELETE CASCADE NOT NULL,
  original_category text,
  corrected_category text,
  original_inbox_type text,
  corrected_inbox_type text,
  from_address text,
  subject_snippet text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.classification_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage classification_corrections"
  ON public.classification_corrections FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
