
-- Add embedded_at column for incremental processing
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS embedded_at timestamptz DEFAULT now();

-- Add full-text search index on chunk_text
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(chunk_text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts ON public.knowledge_chunks USING GIN(fts);

-- Add index on source_table for filtered queries
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON public.knowledge_chunks(source_table);

-- Replace match_knowledge with hybrid search + source filter version
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
      -- Hybrid score: boost vector similarity when keyword also matches
      WHEN keyword_query IS NOT NULL AND kc.fts @@ plainto_tsquery('english', keyword_query)
      THEN LEAST(1.0, (1 - (kc.embedding <=> query_embedding))::float * 1.15 + 0.05)
      ELSE (1 - (kc.embedding <=> query_embedding))::float
    END AS similarity
  FROM public.knowledge_chunks kc
  WHERE
    -- Vector similarity threshold
    (1 - (kc.embedding <=> query_embedding))::float > match_threshold
    -- Optional source filter
    AND (filter_source IS NULL OR kc.source_table = filter_source)
    -- Optional keyword filter (broadens results, doesn't restrict)
  ORDER BY
    -- Prioritize keyword+vector matches, then pure vector
    CASE WHEN keyword_query IS NOT NULL AND kc.fts @@ plainto_tsquery('english', keyword_query) THEN 0 ELSE 1 END,
    kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
