
-- job_attachment_cache: stores HCP attachment data after first fetch
CREATE TABLE public.job_attachment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX job_attachment_cache_hcp_id_idx ON public.job_attachment_cache (hcp_id);

ALTER TABLE public.job_attachment_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read attachment cache"
  ON public.job_attachment_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert attachment cache"
  ON public.job_attachment_cache FOR INSERT TO authenticated WITH CHECK (true);

-- get_tech_dashboard_data: single RPC for TechDashboard
CREATE OR REPLACE FUNCTION public.get_tech_dashboard_data(
  p_employee_name text,
  p_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'jobs', COALESCE((
      SELECT jsonb_agg(row_to_json(j.*) ORDER BY j.arrival_start NULLS LAST)
      FROM public.jobs j
      WHERE j.assigned_to = p_employee_name
        AND j.scheduled_date = p_date
        AND j.status NOT IN ('canceled')
    ), '[]'::jsonb),
    'estimates', COALESCE((
      SELECT jsonb_agg(row_to_json(e.*) ORDER BY e.arrival_start NULLS LAST)
      FROM public.estimates e
      WHERE e.assigned_to = p_employee_name
        AND e.scheduled_date = p_date
        AND COALESCE(e.status, '') NOT IN ('canceled', 'lost')
    ), '[]'::jsonb),
    'travel_legs', COALESCE((
      SELECT jsonb_agg(row_to_json(rt.*) ORDER BY rt.leg_order)
      FROM public.route_travel_cache rt
      WHERE rt.employee_id = (SELECT id FROM public.employees WHERE name = p_employee_name LIMIT 1)
        AND rt.scheduled_date = p_date
    ), '[]'::jsonb)
  )
$$;
