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
        AND COALESCE(j.status, '') NOT IN (
          'archived',
          'canceled',
          'cancelled',
          'closed',
          'complete',
          'completed',
          'done',
          'invoiced',
          'paid'
        )
    ), '[]'::jsonb),
    'estimates', COALESCE((
      SELECT jsonb_agg(row_to_json(e.*) ORDER BY e.arrival_start NULLS LAST)
      FROM public.estimates e
      WHERE e.assigned_to = p_employee_name
        AND e.scheduled_date = p_date
        AND COALESCE(e.status, '') NOT IN (
          'canceled',
          'cancelled',
          'closed',
          'complete',
          'completed',
          'converted',
          'done',
          'legacy_complete',
          'lost',
          'rejected',
          'won'
        )
    ), '[]'::jsonb),
    'travel_legs', COALESCE((
      SELECT jsonb_agg(row_to_json(rt.*) ORDER BY rt.leg_order)
      FROM public.route_travel_cache rt
      WHERE rt.employee_id = (SELECT id FROM public.employees WHERE name = p_employee_name LIMIT 1)
        AND rt.scheduled_date = p_date
    ), '[]'::jsonb)
  )
$$;
