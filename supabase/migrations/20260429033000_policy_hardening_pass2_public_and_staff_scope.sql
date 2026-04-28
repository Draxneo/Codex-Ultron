-- Policy hardening pass 2:
-- - Replace public/all blanket access on public-facing operational tables.
-- - Move public certificate reads behind a token-scoped SECURITY DEFINER RPC.
-- - Replace several older "authenticated true" policies with explicit staff-role checks.

CREATE OR REPLACE FUNCTION public.get_public_certificate(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(c)
  FROM public.customer_certificates c
  WHERE c.token = p_token
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_certificate(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_certificate(text) TO anon;

DROP POLICY IF EXISTS "Anon can update certificates" ON public.customer_certificates;
DROP POLICY IF EXISTS "Anyone can view certificates by token" ON public.customer_certificates;
DROP POLICY IF EXISTS "Authenticated users can manage certificates" ON public.customer_certificates;
DROP POLICY IF EXISTS "Staff can manage customer certificates" ON public.customer_certificates;
CREATE POLICY "Staff can manage customer certificates"
  ON public.customer_certificates
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

DO $$
DECLARE
  _table text;
  _policy record;
  _staff_pred text := $pred$
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  $pred$;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'activity_log',
    'call_log',
    'company_settings',
    'copilot_training',
    'customer_equipment',
    'customer_invoice_items',
    'customer_invoices',
    'customer_portal_sessions',
    'employees',
    'equipment_matchups',
    'estimate_line_items',
    'estimate_presentations',
    'estimate_responses',
    'estimates',
    'follow_up_inquiries',
    'hcp_attachments',
    'hcp_notes',
    'invoice_payments',
    'job_attachments',
    'job_equipment',
    'job_invoices',
    'job_line_items',
    'job_reminders',
    'job_transcripts',
    'jobs',
    'maintenance_plan_templates',
    'part_supply_house_numbers',
    'parts_catalog',
    'payment_plan_rules',
    'permit_applications',
    'permit_authorities'
  ]
  LOOP
    FOR _policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = _table
        AND (
          qual = 'true'
          OR with_check = 'true'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _policy.policyname, _table);
    END LOOP;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Staff role can manage ' || _table,
      _table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      'Staff role can manage ' || _table,
      _table,
      _staff_pred,
      _staff_pred
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Authenticated users can manage certificate templates" ON public.certificate_templates;
DROP POLICY IF EXISTS "Staff can manage certificate templates" ON public.certificate_templates;
CREATE POLICY "Staff can manage certificate templates"
  ON public.certificate_templates
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
