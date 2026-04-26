
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'agent';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS notes text;
