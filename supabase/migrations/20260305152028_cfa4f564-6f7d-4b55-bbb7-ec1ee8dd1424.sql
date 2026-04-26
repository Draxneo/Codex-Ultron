
CREATE TABLE public.agent_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL,
  correction text NOT NULL,
  instruction_slug text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.agent_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_learnings" ON public.agent_learnings FOR ALL USING (true) WITH CHECK (true);
