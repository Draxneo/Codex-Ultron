CREATE TABLE public.message_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  job_type text DEFAULT 'all',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.message_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage sequences"
  ON public.message_sequences FOR ALL TO authenticated
  USING (true) WITH CHECK (true);