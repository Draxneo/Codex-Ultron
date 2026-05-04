
-- Admin categories for organizing admin cards
CREATE TABLE public.admin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own admin_categories"
  ON public.admin_categories FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin card positions within categories
CREATE TABLE public.admin_card_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_key text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.admin_categories(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.admin_card_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own admin_card_positions"
  ON public.admin_card_positions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
