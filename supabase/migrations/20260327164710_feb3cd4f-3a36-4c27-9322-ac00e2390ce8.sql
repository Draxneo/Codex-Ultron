
-- Line item templates table with pricing rules engine
CREATE TABLE public.line_item_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  base_price numeric NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'fee',
  category text NOT NULL DEFAULT 'service',
  rules jsonb NOT NULL DEFAULT '{}',
  auto_add_for text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.line_item_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read templates"
  ON public.line_item_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage templates"
  ON public.line_item_templates FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Seed the 5 core templates
INSERT INTO public.line_item_templates (slug, name, description, base_price, kind, category, rules, auto_add_for, sort_order) VALUES
  ('service_call_fee', 'Service Call Fee', 'Standard diagnostic/service call fee', 59.00, 'fee', 'service',
   '{"plan_member_price": 29.00, "waive_with_repair": true}', '{service}', 1),
  ('seasonal_tune_up', 'Seasonal Tune-Up', 'Seasonal maintenance check', 89.00, 'labor', 'maintenance',
   '{"plan_pct_of_annual": 50}', '{maintenance}', 2),
  ('real_estate_inspection', 'Real Estate Inspection', 'Full HVAC inspection for property sale (heat + AC)', 178.00, 'fee', 'inspection',
   '{"qty_default": 1}', '{inspection}', 3),
  ('diagnostic_fee', 'Diagnostic Fee', 'In-depth troubleshooting and diagnosis', 59.00, 'fee', 'service',
   '{"plan_member_price": 29.00}', '{}', 4),
  ('free_equipment_evaluation', 'Free Equipment Evaluation', 'Complimentary equipment evaluation — no charge', 0.00, 'fee', 'service',
   '{"show_as_complimentary": true, "customer_facing_note": "Complimentary equipment evaluation — no charge"}', '{service}', 5);
