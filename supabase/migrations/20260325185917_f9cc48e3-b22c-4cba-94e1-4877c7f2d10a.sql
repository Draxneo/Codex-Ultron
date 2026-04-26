
-- AI Agents table for the Agent Network canvas
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'planned', 'disabled')),
  edge_function text,
  tools text[] DEFAULT '{}',
  triggers text[] DEFAULT '{}',
  position jsonb DEFAULT '{"x": 0, "y": 0}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ai_agents"
  ON public.ai_agents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update ai_agents"
  ON public.ai_agents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can insert ai_agents"
  ON public.ai_agents FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete ai_agents"
  ON public.ai_agents FOR DELETE TO authenticated USING (true);

-- AI Agent Connections table for edges
CREATE TABLE public.ai_agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  trigger_description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ai_agent_connections"
  ON public.ai_agent_connections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage ai_agent_connections"
  ON public.ai_agent_connections FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed agents
INSERT INTO public.ai_agents (name, label, description, status, edge_function, tools, triggers, position) VALUES
  ('orchestrator', 'Orchestrator', 'Main AI agent that handles general queries, scheduling, customer lookups, and delegates specialist tasks via handoff.', 'active', 'ai-task-agent', ARRAY['search_jobs','lookup_customer','schedule_job','create_quote','send_sms','send_email','handoff_to_agent'], ARRAY['Chat message','SMS','Voice transcription','Portal query'], '{"x": 400, "y": 50}'),
  ('repair_quote', 'Repair Quoting', 'Specialist agent for generating tiered service repair quotes with margin targeting, outlier detection, and parts cost analysis.', 'active', 'repair-quote-agent', ARRAY['analyze_diagnosis','calculate_margins','generate_tiers','insert_repair_items'], ARRAY['Handoff from orchestrator'], '{"x": 700, "y": 250}'),
  ('parts_scraper', 'Parts Scraper', 'Automated agent that logs into supply house portals via Firecrawl and scrapes pricing/SKU data into the parts catalog.', 'planned', 'parts-scraper-agent', ARRAY['firecrawl_login','scrape_catalog','upsert_parts'], ARRAY['Scheduled daily','Manual trigger'], '{"x": 100, "y": 250}'),
  ('follow_up', 'Follow-Up Agent', 'Handles automated follow-up sequences: check-in texts, review requests, and inquiry responses.', 'planned', 'follow-up-agent', ARRAY['send_follow_up_sms','check_response','escalate'], ARRAY['Job completed','No response timer'], '{"x": 400, "y": 450}'),
  ('scheduling', 'Scheduling Agent', 'Optimizes technician scheduling using drive times, skill matching, and workload balancing.', 'planned', 'scheduling-agent', ARRAY['calculate_drive_times','match_skills','optimize_route'], ARRAY['New job created','Reschedule request'], '{"x": 700, "y": 450}');

-- Seed connections
INSERT INTO public.ai_agent_connections (source_agent_id, target_agent_id, trigger_description)
SELECT
  (SELECT id FROM public.ai_agents WHERE name = 'orchestrator'),
  (SELECT id FROM public.ai_agents WHERE name = 'repair_quote'),
  'Tech requests repair quote';

-- Add repair_quote to ai_model_config
INSERT INTO public.ai_model_config (task_key, label, model) VALUES
  ('repair_quote', 'Repair Quoting', 'google/gemini-3-flash-preview')
ON CONFLICT DO NOTHING;
