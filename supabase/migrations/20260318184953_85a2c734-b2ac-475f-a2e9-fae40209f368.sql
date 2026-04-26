
-- BATCH 2: Comprehensive RLS lockdown for all remaining tables

-- 1. agent_instructions: public → authenticated
DROP POLICY IF EXISTS "Allow all access to agent_instructions" ON public.agent_instructions;
CREATE POLICY "Authenticated full access to agent_instructions" ON public.agent_instructions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. agent_learnings: public → authenticated
DROP POLICY IF EXISTS "Allow all access to agent_learnings" ON public.agent_learnings;
CREATE POLICY "Authenticated full access to agent_learnings" ON public.agent_learnings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. agent_tools: public → authenticated
DROP POLICY IF EXISTS "Allow all access to agent_tools" ON public.agent_tools;
CREATE POLICY "Authenticated full access to agent_tools" ON public.agent_tools FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. agreement_visits: public → authenticated
DROP POLICY IF EXISTS "Allow all access to agreement_visits" ON public.agreement_visits;
CREATE POLICY "Authenticated full access to agreement_visits" ON public.agreement_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. call_log: public → authenticated
DROP POLICY IF EXISTS "Allow all access to call_log" ON public.call_log;
CREATE POLICY "Authenticated full access to call_log" ON public.call_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. customer_equipment: public → authenticated
DROP POLICY IF EXISTS "Allow all access to customer_equipment" ON public.customer_equipment;
CREATE POLICY "Authenticated full access to customer_equipment" ON public.customer_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. customer_invoice_items: public → authenticated
DROP POLICY IF EXISTS "Allow all access to customer_invoice_items" ON public.customer_invoice_items;
CREATE POLICY "Authenticated full access to customer_invoice_items" ON public.customer_invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. customer_invoices: public → authenticated
DROP POLICY IF EXISTS "Allow all access to customer_invoices" ON public.customer_invoices;
CREATE POLICY "Authenticated full access to customer_invoices" ON public.customer_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. customer_portal_codes: remove anon access
DROP POLICY IF EXISTS "Anon can manage portal codes" ON public.customer_portal_codes;

-- 10. customer_portal_sessions: remove anon SELECT
DROP POLICY IF EXISTS "Anon can read portal sessions" ON public.customer_portal_sessions;

-- 11. email_actions: public → authenticated
DROP POLICY IF EXISTS "Authenticated can delete email_actions" ON public.email_actions;
DROP POLICY IF EXISTS "Authenticated can insert email_actions" ON public.email_actions;
DROP POLICY IF EXISTS "Authenticated can read email_actions" ON public.email_actions;
DROP POLICY IF EXISTS "Authenticated can update email_actions" ON public.email_actions;
CREATE POLICY "Authenticated full access to email_actions" ON public.email_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. estimates: public → authenticated
DROP POLICY IF EXISTS "Allow all access to estimates" ON public.estimates;
CREATE POLICY "Authenticated full access to estimates" ON public.estimates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. service_agreements: public → authenticated
DROP POLICY IF EXISTS "Allow all access to service_agreements" ON public.service_agreements;
CREATE POLICY "Authenticated full access to service_agreements" ON public.service_agreements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. referrals: keep anon INSERT for public form, lock down reads
DROP POLICY IF EXISTS "Anyone can read referrals" ON public.referrals;
DROP POLICY IF EXISTS "Anyone can insert referrals" ON public.referrals;
CREATE POLICY "Anon can submit referrals" ON public.referrals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated full access to referrals" ON public.referrals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 15. portal_requests: remove anon read, keep anon insert
DROP POLICY IF EXISTS "Anon can read own portal_requests" ON public.portal_requests;
DROP POLICY IF EXISTS "Anon can insert portal_requests" ON public.portal_requests;
CREATE POLICY "Anon can submit portal_requests" ON public.portal_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated full access to portal_requests" ON public.portal_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 16. job_line_items: public → authenticated
DROP POLICY IF EXISTS "Allow all access to job_line_items" ON public.job_line_items;
CREATE POLICY "Authenticated full access to job_line_items" ON public.job_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 17. quotes: public → authenticated
DROP POLICY IF EXISTS "Allow all access to quotes" ON public.quotes;
CREATE POLICY "Authenticated full access to quotes" ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 18. quote_options: public → authenticated
DROP POLICY IF EXISTS "Allow all access to quote_options" ON public.quote_options;
CREATE POLICY "Authenticated full access to quote_options" ON public.quote_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 19. plan_perk_usage: public → authenticated
DROP POLICY IF EXISTS "Anon can read plan_perk_usage" ON public.plan_perk_usage;
DROP POLICY IF EXISTS "Allow all access to plan_perk_usage" ON public.plan_perk_usage;
CREATE POLICY "Authenticated full access to plan_perk_usage" ON public.plan_perk_usage FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 20. job_attachments: public → authenticated
DROP POLICY IF EXISTS "Allow all access to job_attachments" ON public.job_attachments;
CREATE POLICY "Authenticated full access to job_attachments" ON public.job_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 21. payment_plan_rules: ensure authenticated only
DROP POLICY IF EXISTS "Allow all access to payment_plan_rules" ON public.payment_plan_rules;
DROP POLICY IF EXISTS "Authenticated full access to payment_plan_rules" ON public.payment_plan_rules;
CREATE POLICY "Authenticated full access to payment_plan_rules" ON public.payment_plan_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 22. maintenance_plan_templates: ensure authenticated only
DROP POLICY IF EXISTS "Allow all access to maintenance_plan_templates" ON public.maintenance_plan_templates;
DROP POLICY IF EXISTS "Authenticated full access to maintenance_plan_templates" ON public.maintenance_plan_templates;
CREATE POLICY "Authenticated full access to maintenance_plan_templates" ON public.maintenance_plan_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 23. email_templates: public → authenticated
DROP POLICY IF EXISTS "Allow all access to email_templates" ON public.email_templates;
CREATE POLICY "Authenticated full access to email_templates" ON public.email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 24. job_reminders: public → authenticated
DROP POLICY IF EXISTS "Allow all access to job_reminders" ON public.job_reminders;
CREATE POLICY "Authenticated full access to job_reminders" ON public.job_reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 25. task_templates: public → authenticated
DROP POLICY IF EXISTS "Allow all access to task_templates" ON public.task_templates;
CREATE POLICY "Authenticated full access to task_templates" ON public.task_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 26. supply_house_locations: public → authenticated
DROP POLICY IF EXISTS "Allow all access to supply_house_locations" ON public.supply_house_locations;
CREATE POLICY "Authenticated full access to supply_house_locations" ON public.supply_house_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 27. preinstall_photos: keep anon insert, lock down rest
DROP POLICY IF EXISTS "Allow all access to preinstall_photos" ON public.preinstall_photos;
DROP POLICY IF EXISTS "Anon can insert preinstall photos" ON public.preinstall_photos;
CREATE POLICY "Anon can insert preinstall_photos" ON public.preinstall_photos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated full access to preinstall_photos" ON public.preinstall_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 28. addons: move manage to authenticated, keep public SELECT
DROP POLICY IF EXISTS "Admins can manage addons" ON public.addons;
CREATE POLICY "Authenticated can manage addons" ON public.addons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 29. brochure_blocks: move manage to authenticated, keep public SELECT
DROP POLICY IF EXISTS "Admins can manage brochure blocks" ON public.brochure_blocks;
CREATE POLICY "Authenticated can manage brochure_blocks" ON public.brochure_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 30. comparison_blocks: move manage to authenticated, keep public SELECT
DROP POLICY IF EXISTS "Admins can manage comparison blocks" ON public.comparison_blocks;
CREATE POLICY "Authenticated can manage comparison_blocks" ON public.comparison_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 31. tech_form_photos: remove anon UPDATE (keep anon SELECT + INSERT)
DROP POLICY IF EXISTS "Anon can update tech_form_photos" ON public.tech_form_photos;
