-- Add unified 5W (Who/What/When/Where/Why) facts payload to JARVIS card sources.
-- Nullable jsonb so existing rows keep rendering via legacy adapter fallback.
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS facts jsonb;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS facts jsonb;

-- GIN index for occasional "who is mentioned in any open card" queries.
CREATE INDEX IF NOT EXISTS idx_todos_facts_gin ON public.todos USING gin (facts);
CREATE INDEX IF NOT EXISTS idx_action_items_facts_gin ON public.action_items USING gin (facts);