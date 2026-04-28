CREATE TABLE IF NOT EXISTS public.job_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  technician_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  transcript_text text NOT NULL,
  source text NOT NULL DEFAULT 'tech_voice' CHECK (source IN ('tech_voice','manual_note','call_transcript','import')),
  ai_processed_at timestamptz NULL,
  ai_response text NULL,
  suggested_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_transcripts_job_id
  ON public.job_transcripts(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_transcripts_technician_id
  ON public.job_transcripts(technician_id, created_at DESC)
  WHERE technician_id IS NOT NULL;

ALTER TABLE public.job_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to job_transcripts" ON public.job_transcripts;
CREATE POLICY "Authenticated full access to job_transcripts"
ON public.job_transcripts FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.job_transcripts IS
  'Durable tech voice/manual transcripts tied to jobs before AI parsing, so field notes survive even if AI fails.';
