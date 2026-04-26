
-- Add status column to tech_forms (draft vs submitted)
ALTER TABLE public.tech_forms ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- Allow UPDATE on tech_forms (needed for save-as-you-go and final submit)
CREATE POLICY "Anon can update tech_forms" ON public.tech_forms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can update tech_forms" ON public.tech_forms FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow UPDATE on tech_form_responses (needed for upsert on field change)
CREATE POLICY "Anon can update responses" ON public.tech_form_responses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can update responses" ON public.tech_form_responses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow DELETE on tech_form_responses (for re-saving)
CREATE POLICY "Anon can delete responses" ON public.tech_form_responses FOR DELETE USING (true);
CREATE POLICY "Authenticated can delete responses" ON public.tech_form_responses FOR DELETE TO authenticated USING (true);
