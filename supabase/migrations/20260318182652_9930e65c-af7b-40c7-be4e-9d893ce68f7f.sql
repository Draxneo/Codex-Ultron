
-- ============================================================
-- BATCH 1: Drop public-role "Allow all access" policies
-- and replace with authenticated-role equivalents.
-- Edge functions use service_role key so they bypass RLS.
-- ============================================================

-- 1. jobs
DROP POLICY IF EXISTS "Allow all access to jobs" ON public.jobs;
CREATE POLICY "Authenticated full access to jobs" ON public.jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. activity_log
DROP POLICY IF EXISTS "Allow all access to activity_log" ON public.activity_log;
CREATE POLICY "Authenticated full access to activity_log" ON public.activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. task_photos
DROP POLICY IF EXISTS "Allow all access to task_photos" ON public.task_photos;
CREATE POLICY "Authenticated full access to task_photos" ON public.task_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. copilot_training
DROP POLICY IF EXISTS "Allow all access to copilot_training" ON public.copilot_training;
CREATE POLICY "Authenticated full access to copilot_training" ON public.copilot_training FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. job_equipment
DROP POLICY IF EXISTS "Allow all access to job_equipment" ON public.job_equipment;
CREATE POLICY "Authenticated full access to job_equipment" ON public.job_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. ahri_lookups
DROP POLICY IF EXISTS "Allow all access to ahri_lookups" ON public.ahri_lookups;
CREATE POLICY "Authenticated full access to ahri_lookups" ON public.ahri_lookups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. parts_catalog
DROP POLICY IF EXISTS "Allow all access to parts_catalog" ON public.parts_catalog;
CREATE POLICY "Authenticated full access to parts_catalog" ON public.parts_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. part_supply_house_numbers
DROP POLICY IF EXISTS "Allow all access to part_supply_house_numbers" ON public.part_supply_house_numbers;
CREATE POLICY "Authenticated full access to part_supply_house_numbers" ON public.part_supply_house_numbers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. job_invoices
DROP POLICY IF EXISTS "Allow all access to job_invoices" ON public.job_invoices;
CREATE POLICY "Authenticated full access to job_invoices" ON public.job_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. supply_houses
DROP POLICY IF EXISTS "Allow all access to supply_houses" ON public.supply_houses;
CREATE POLICY "Authenticated full access to supply_houses" ON public.supply_houses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. warranty_registrations
DROP POLICY IF EXISTS "Allow all access to warranty_registrations" ON public.warranty_registrations;
CREATE POLICY "Authenticated full access to warranty_registrations" ON public.warranty_registrations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. sms_log
DROP POLICY IF EXISTS "Allow all access to sms_log" ON public.sms_log;
CREATE POLICY "Authenticated full access to sms_log" ON public.sms_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. company_settings
DROP POLICY IF EXISTS "Allow all access to company_settings" ON public.company_settings;
CREATE POLICY "Authenticated full access to company_settings" ON public.company_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. template_tasks
DROP POLICY IF EXISTS "Allow all access to template_tasks" ON public.template_tasks;
CREATE POLICY "Authenticated full access to template_tasks" ON public.template_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 15. employees
DROP POLICY IF EXISTS "Allow all access to employees" ON public.employees;
CREATE POLICY "Authenticated full access to employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 16. job_tasks
DROP POLICY IF EXISTS "Allow all access to job_tasks" ON public.job_tasks;
CREATE POLICY "Authenticated full access to job_tasks" ON public.job_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 17. sms_templates
DROP POLICY IF EXISTS "Allow all access to sms_templates" ON public.sms_templates;
CREATE POLICY "Authenticated full access to sms_templates" ON public.sms_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 18. manufacturer_brochures - fix admin policy from public to authenticated
DROP POLICY IF EXISTS "Admins can manage brochures" ON public.manufacturer_brochures;
CREATE POLICY "Admins can manage brochures" ON public.manufacturer_brochures FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- Also lock down the read policy
DROP POLICY IF EXISTS "Anyone can read brochures" ON public.manufacturer_brochures;
CREATE POLICY "Authenticated can read brochures" ON public.manufacturer_brochures FOR SELECT TO authenticated USING (true);

-- ============================================================
-- BATCH 2: Remove unnecessary anon/public policies on tables
-- that are only accessed by edge functions (service_role).
-- ============================================================

-- emails: webhook uses service_role
DROP POLICY IF EXISTS "Anon can insert emails" ON public.emails;

-- stripe_events: webhook uses service_role
DROP POLICY IF EXISTS "Service role can insert stripe_events" ON public.stripe_events;

-- property_data: lookup-property edge function uses service_role
DROP POLICY IF EXISTS "Anon can insert property data" ON public.property_data;
DROP POLICY IF EXISTS "Anon can update property data" ON public.property_data;
DROP POLICY IF EXISTS "Anyone can read property data" ON public.property_data;
-- Keep authenticated policies that already exist for property_data

-- tech_form_responses: remove the overly broad public DELETE
DROP POLICY IF EXISTS "Anon can delete responses" ON public.tech_form_responses;

-- tech_forms: remove the duplicate public UPDATE (anon-specific ones remain)
DROP POLICY IF EXISTS "Anon can update tech_forms" ON public.tech_forms;

-- ============================================================
-- BATCH 3: Ensure portal tables have NO public access
-- (only edge functions with service_role touch these)
-- ============================================================

-- Check and remove any public policies on portal tables
-- customer_portal_codes
DROP POLICY IF EXISTS "Allow all access to customer_portal_codes" ON public.customer_portal_codes;
DROP POLICY IF EXISTS "Allow public access to customer_portal_codes" ON public.customer_portal_codes;

-- customer_portal_sessions  
DROP POLICY IF EXISTS "Allow all access to customer_portal_sessions" ON public.customer_portal_sessions;
DROP POLICY IF EXISTS "Allow public access to customer_portal_sessions" ON public.customer_portal_sessions;
