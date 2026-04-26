
-- agent_instructions table
CREATE TABLE public.agent_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.agent_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_instructions" ON public.agent_instructions FOR ALL USING (true) WITH CHECK (true);

-- agent_tools table
CREATE TABLE public.agent_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  function_name text NOT NULL,
  is_enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_tools" ON public.agent_tools FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for uploaded documents
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-documents', 'agent-documents', false);
CREATE POLICY "Authenticated users can upload agent documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'agent-documents');
CREATE POLICY "Authenticated users can read agent documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'agent-documents');
CREATE POLICY "Authenticated users can delete agent documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'agent-documents');
