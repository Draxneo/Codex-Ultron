
-- Brand profiles table
CREATE TABLE public.brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  subhead text NOT NULL DEFAULT '',
  eyebrow text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  body_1 text NOT NULL DEFAULT '',
  body_2 text NOT NULL DEFAULT '',
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  refrigerant jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo_url text NOT NULL DEFAULT '',
  accent_color text NOT NULL DEFAULT 'text-accent',
  accent_bg text NOT NULL DEFAULT 'bg-accent/10',
  pill_bg text NOT NULL DEFAULT 'bg-accent/20',
  gradient text NOT NULL DEFAULT 'from-primary via-primary to-primary/80',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read brand_profiles" ON public.brand_profiles FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage brand_profiles" ON public.brand_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Presentation sections table
CREATE TABLE public.presentation_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text UNIQUE NOT NULL,
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read presentation_sections" ON public.presentation_sections FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage presentation_sections" ON public.presentation_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);
