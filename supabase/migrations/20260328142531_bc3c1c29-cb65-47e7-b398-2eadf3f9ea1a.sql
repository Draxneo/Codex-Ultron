CREATE TABLE public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'jarvis',
  category text NOT NULL,
  title text NOT NULL,
  description text,
  suggested_action text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  customer_phone text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage action_items"
  ON public.action_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_action_items_status ON public.action_items(status);
CREATE INDEX idx_action_items_category ON public.action_items(category);