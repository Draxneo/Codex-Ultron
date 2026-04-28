-- Policy hardening pass 1:
-- - Replace blanket authenticated access on AI/JARVIS operational tables.
-- - Add explicit policies for RLS-enabled tables that had no policies.
-- - Remove anonymous execute access from internal SECURITY DEFINER functions,
--   while preserving public token-scoped customer RPCs.
-- - Make the HCP truth-map view respect the querying user's privileges.

ALTER VIEW IF EXISTS public.hcp_job_invoice_truth_map SET (security_invoker = true);

-- Public token-scoped RPCs remain callable by anonymous customers. Everything
-- else should require at least an authenticated staff session or service role.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT EXECUTE ON FUNCTION public.approve_public_quick_quote(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_company_settings() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_estimate_presentation(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_job_cart(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_quick_quote_link(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_agreement_presentation(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_estimate_response(text, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_agreement_enrollment(text) TO anon;
GRANT EXECUTE ON FUNCTION public.track_cart_view(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.track_estimate_presentation_view(text) TO anon;
GRANT EXECUTE ON FUNCTION public.track_public_agreement_presentation_view(text) TO anon;
GRANT EXECUTE ON FUNCTION public.track_quick_quote_view(text) TO anon;

-- These helpers can reach privileged internals and should not be direct RPCs
-- for browser sessions. Service-role Edge Functions and database jobs still
-- retain access where needed.
REVOKE EXECUTE ON FUNCTION public.safe_http_post(text, jsonb, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_http_post(text, jsonb, text, integer, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_chunks(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_chunks(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_operational_logs(integer, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_operational_logs(integer, integer, integer, integer, integer, integer, integer) TO service_role;

-- action_items: every signed-in staff role can see shared cards; techs can
-- manage cards assigned to their employee record.
DROP POLICY IF EXISTS "Staff can read action_items" ON public.action_items;
DROP POLICY IF EXISTS "Staff can create action_items" ON public.action_items;
DROP POLICY IF EXISTS "Staff can update action_items" ON public.action_items;
DROP POLICY IF EXISTS "Office staff can delete action_items" ON public.action_items;

CREATE POLICY "Staff can read action_items"
  ON public.action_items
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR assigned_to = (SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Staff can create action_items"
  ON public.action_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Staff can update action_items"
  ON public.action_items
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR assigned_to = (SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR assigned_to = (SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Office staff can delete action_items"
  ON public.action_items
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

-- RLS-enabled tables with no policies.
DROP POLICY IF EXISTS "Office staff can manage customer portal codes" ON public.customer_portal_codes;
CREATE POLICY "Office staff can manage customer portal codes"
  ON public.customer_portal_codes
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS "Staff can read and write geocode cache" ON public.geocode_cache;
CREATE POLICY "Staff can read and write geocode cache"
  ON public.geocode_cache
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

DROP POLICY IF EXISTS "Staff can read and write directions cache" ON public.directions_cache;
CREATE POLICY "Staff can read and write directions cache"
  ON public.directions_cache
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

DROP POLICY IF EXISTS "Employees can read their own tab access" ON public.employee_tab_access;
DROP POLICY IF EXISTS "Admins can manage employee tab access" ON public.employee_tab_access;
CREATE POLICY "Employees can read their own tab access"
  ON public.employee_tab_access
  FOR SELECT
  TO authenticated
  USING (
    employee_id = (SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Admins can manage employee tab access"
  ON public.employee_tab_access
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Office staff can manage leads" ON public.leads;
CREATE POLICY "Office staff can manage leads"
  ON public.leads
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS "Staff can read service pricebook" ON public.service_pricebook;
DROP POLICY IF EXISTS "Office staff can manage service pricebook" ON public.service_pricebook;
CREATE POLICY "Staff can read service pricebook"
  ON public.service_pricebook
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Office staff can manage service pricebook"
  ON public.service_pricebook
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS "Staff can read tech location events" ON public.tech_location_events;
DROP POLICY IF EXISTS "Techs can create own location events" ON public.tech_location_events;
DROP POLICY IF EXISTS "Office staff can manage tech location events" ON public.tech_location_events;
CREATE POLICY "Staff can read tech location events"
  ON public.tech_location_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR employee_id = (SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Techs can create own location events"
  ON public.tech_location_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = (SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Office staff can manage tech location events"
  ON public.tech_location_events
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS "Office staff can manage workflow alerts" ON public.workflow_alerts;
CREATE POLICY "Office staff can manage workflow alerts"
  ON public.workflow_alerts
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

-- Replace broad AI/JARVIS table policies.
DROP POLICY IF EXISTS "Authenticated full access to agent_instructions" ON public.agent_instructions;
DROP POLICY IF EXISTS "Staff can read agent instructions" ON public.agent_instructions;
DROP POLICY IF EXISTS "Admins can manage agent instructions" ON public.agent_instructions;
CREATE POLICY "Staff can read agent instructions"
  ON public.agent_instructions
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Admins can manage agent instructions"
  ON public.agent_instructions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated full access to agent_tools" ON public.agent_tools;
DROP POLICY IF EXISTS "Staff can read agent tools" ON public.agent_tools;
DROP POLICY IF EXISTS "Admins can manage agent tools" ON public.agent_tools;
CREATE POLICY "Staff can read agent tools"
  ON public.agent_tools
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Admins can manage agent tools"
  ON public.agent_tools
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated full access to agent_learnings" ON public.agent_learnings;
DROP POLICY IF EXISTS "Staff can read agent learnings" ON public.agent_learnings;
DROP POLICY IF EXISTS "Admins can manage agent learnings" ON public.agent_learnings;
CREATE POLICY "Staff can read agent learnings"
  ON public.agent_learnings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Admins can manage agent learnings"
  ON public.agent_learnings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can manage ai_agent_connections" ON public.ai_agent_connections;
DROP POLICY IF EXISTS "Authenticated users can read ai_agent_connections" ON public.ai_agent_connections;
DROP POLICY IF EXISTS "Staff can read ai agent connections" ON public.ai_agent_connections;
DROP POLICY IF EXISTS "Admins can manage ai agent connections" ON public.ai_agent_connections;
CREATE POLICY "Staff can read ai agent connections"
  ON public.ai_agent_connections
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Admins can manage ai agent connections"
  ON public.ai_agent_connections
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can delete ai_agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Authenticated users can insert ai_agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Authenticated users can read ai_agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Authenticated users can update ai_agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Staff can read ai agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Admins can manage ai agents" ON public.ai_agents;
CREATE POLICY "Staff can read ai agents"
  ON public.ai_agents
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Admins can manage ai agents"
  ON public.ai_agents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read" ON public.ai_model_config;
DROP POLICY IF EXISTS "Authenticated update" ON public.ai_model_config;
DROP POLICY IF EXISTS "Staff can read ai model config" ON public.ai_model_config;
DROP POLICY IF EXISTS "Admins can update ai model config" ON public.ai_model_config;
CREATE POLICY "Staff can read ai model config"
  ON public.ai_model_config
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

CREATE POLICY "Admins can update ai model config"
  ON public.ai_model_config
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Route optimizer drafts are dispatch/office workflow data.
DROP POLICY IF EXISTS "Authenticated users can manage route optimization runs" ON public.route_optimization_runs;
DROP POLICY IF EXISTS "Authenticated users can manage route optimization suggestions" ON public.route_optimization_suggestions;
DROP POLICY IF EXISTS "Authenticated users can manage route sms queue" ON public.route_sms_queue;

CREATE POLICY "Office staff can manage route optimization runs"
  ON public.route_optimization_runs
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Office staff can manage route optimization suggestions"
  ON public.route_optimization_suggestions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Office staff can manage route sms queue"
  ON public.route_sms_queue
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );
