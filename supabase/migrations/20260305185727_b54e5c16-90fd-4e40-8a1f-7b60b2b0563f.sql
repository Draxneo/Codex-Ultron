
-- Create estimate_reviews table
CREATE TABLE public.estimate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_form_id uuid REFERENCES public.tech_forms(id) ON DELETE CASCADE NOT NULL,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  selected_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_review',
  admin_notes text,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.estimate_reviews ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage estimate_reviews"
  ON public.estimate_reviews FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read all (office + techs need visibility)
CREATE POLICY "Authenticated can read estimate_reviews"
  ON public.estimate_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Anon can insert (tech form is public)
CREATE POLICY "Anon can insert estimate_reviews"
  ON public.estimate_reviews FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anon can read own
CREATE POLICY "Anon can read estimate_reviews"
  ON public.estimate_reviews FOR SELECT
  TO anon
  USING (true);

-- Insert the multi_button_group field for estimate forms
INSERT INTO public.tech_form_fields (job_type, field_type, label, is_required, options, sort_order, step_group)
VALUES ('estimate', 'multi_button_group', 'Options to present to customer', true, '["Value", "Value Plus", "Good", "Better", "Best", "Ultimate"]'::jsonb, 900, 'notes');
