
-- Re-enable pgvector
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- Create table using schema-qualified type
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid,
  chunk_text text NOT NULL,
  embedding extensions.vector(768),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Source index
CREATE INDEX knowledge_chunks_source_idx ON public.knowledge_chunks (source_table, source_id);

-- RLS
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read knowledge chunks"
  ON public.knowledge_chunks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage knowledge chunks"
  ON public.knowledge_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Match function — use plpgsql to handle the schema-qualified operators
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding extensions.vector(768),
  match_count int DEFAULT 8,
  match_threshold float DEFAULT 0.7
)
RETURNS TABLE(
  id uuid,
  source_table text,
  source_id uuid,
  chunk_text text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.source_table,
    kc.source_id,
    kc.chunk_text,
    kc.metadata,
    (1 - (kc.embedding <=> query_embedding))::float AS similarity
  FROM public.knowledge_chunks kc
  WHERE (1 - (kc.embedding <=> query_embedding))::float > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
