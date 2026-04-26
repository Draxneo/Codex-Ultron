
-- Add quality_score column to knowledge_chunks
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS quality_score float DEFAULT 0.5;

-- Create rag_feedback table for the feedback loop
CREATE TABLE IF NOT EXISTS public.rag_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid REFERENCES public.knowledge_chunks(id) ON DELETE SET NULL,
  session_id uuid,
  feedback_type text NOT NULL DEFAULT 'negative',
  details text,
  query_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rag_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback"
  ON public.rag_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read feedback"
  ON public.rag_feedback FOR SELECT
  USING (true);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_rag_feedback_chunk ON public.rag_feedback(chunk_id);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_created ON public.rag_feedback(created_at);

-- Function to clean up stale chunks (call/sms older than N months)
CREATE OR REPLACE FUNCTION public.cleanup_stale_chunks(months_old integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.knowledge_chunks
  WHERE source_table IN ('call_log', 'sms_log')
    AND created_at < now() - (months_old || ' months')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Update match_knowledge to factor in quality_score and negative feedback
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding extensions.vector,
  match_count integer DEFAULT 8,
  match_threshold double precision DEFAULT 0.7,
  filter_source text DEFAULT NULL,
  keyword_query text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  source_table text,
  source_id uuid,
  chunk_text text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.source_table,
    kc.source_id,
    kc.chunk_text,
    kc.metadata,
    CASE
      -- Hybrid score: boost when keyword also matches, factor in quality_score
      WHEN keyword_query IS NOT NULL AND kc.fts @@ plainto_tsquery('english', keyword_query)
      THEN LEAST(1.0, ((1 - (kc.embedding <=> query_embedding))::float * 1.15 + 0.05) * COALESCE(kc.quality_score, 0.5))
      ELSE (1 - (kc.embedding <=> query_embedding))::float * COALESCE(kc.quality_score, 0.5)
    END AS similarity
  FROM public.knowledge_chunks kc
  LEFT JOIN LATERAL (
    SELECT count(*) AS neg_count
    FROM public.rag_feedback rf
    WHERE rf.chunk_id = kc.id AND rf.feedback_type = 'negative'
  ) fb ON true
  WHERE
    -- Vector similarity threshold (before quality weighting)
    (1 - (kc.embedding <=> query_embedding))::float > match_threshold
    -- Optional source filter
    AND (filter_source IS NULL OR kc.source_table = filter_source)
    -- Down-rank heavily negative-feedback chunks (more than 3 negatives = exclude)
    AND COALESCE(fb.neg_count, 0) < 4
  ORDER BY
    -- Prioritize keyword+vector matches, then pure vector
    CASE WHEN keyword_query IS NOT NULL AND kc.fts @@ plainto_tsquery('english', keyword_query) THEN 0 ELSE 1 END,
    -- Factor in negative feedback as a penalty
    (1 - (kc.embedding <=> query_embedding))::float * COALESCE(kc.quality_score, 0.5) * (1.0 - LEAST(0.5, COALESCE(fb.neg_count, 0)::float * 0.15)) DESC
  LIMIT match_count;
END;
$$;

-- Trigger function to queue embedding on new call transcripts
CREATE OR REPLACE FUNCTION public.queue_embedding_on_transcript()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when transcription is newly populated
  IF NEW.transcription IS NOT NULL AND (OLD.transcription IS NULL OR OLD.transcription = '') THEN
    PERFORM net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1)
             || '/functions/v1/generate-embeddings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
      ),
      body := jsonb_build_object('source', 'call_log', 'mode', 'incremental'),
      timeout_milliseconds := 30000
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_embed_call_transcript
  AFTER UPDATE OF transcription ON public.call_log
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_embedding_on_transcript();

-- Trigger function to queue embedding on training data changes
CREATE OR REPLACE FUNCTION public.queue_embedding_on_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1)
           || '/functions/v1/generate-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
    ),
    body := jsonb_build_object('source', 'copilot_training', 'mode', 'incremental'),
    timeout_milliseconds := 30000
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_embed_training_change
  AFTER INSERT OR UPDATE OF content ON public.copilot_training
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.queue_embedding_on_training();
