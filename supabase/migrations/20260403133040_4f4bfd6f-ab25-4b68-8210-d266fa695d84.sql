
CREATE TABLE public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  function_name text NOT NULL,
  endpoint text,
  tokens_used integer,
  estimated_cost_cents numeric DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_log_service ON public.api_usage_log (service);
CREATE INDEX idx_api_usage_log_created_at ON public.api_usage_log (created_at DESC);
CREATE INDEX idx_api_usage_log_function ON public.api_usage_log (function_name);

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read api_usage_log"
  ON public.api_usage_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert api_usage_log"
  ON public.api_usage_log FOR INSERT WITH CHECK (true);
