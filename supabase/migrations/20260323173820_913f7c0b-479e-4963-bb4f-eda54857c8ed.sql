
-- Quick Links table (company-wide, not per-user)
CREATE TABLE public.quick_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  href text NOT NULL,
  label text NOT NULL,
  sub text NOT NULL DEFAULT '',
  icon_name text NOT NULL DEFAULT 'LinkIcon',
  category text NOT NULL DEFAULT 'Resources',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_links ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can read quick_links"
  ON public.quick_links FOR SELECT TO authenticated USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert quick_links"
  ON public.quick_links FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update quick_links"
  ON public.quick_links FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete quick_links"
  ON public.quick_links FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Quick link categories table
CREATE TABLE public.quick_link_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.quick_link_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quick_link_categories"
  ON public.quick_link_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage quick_link_categories"
  ON public.quick_link_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_model text DEFAULT 'google/gemini-3-flash-preview',
  ADD COLUMN IF NOT EXISTS jarvis_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS copilot_position jsonb;
