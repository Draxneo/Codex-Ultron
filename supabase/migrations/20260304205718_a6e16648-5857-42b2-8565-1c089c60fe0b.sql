
-- 1. App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'office', 'tech');

-- 2. User roles table (separate from profiles per security rules)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. RLS on user_roles: users can read own roles, admins can manage all
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Tech forms table (completion form submitted after a job)
CREATE TABLE public.tech_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES public.employees(id) NOT NULL,
  equipment_model text,
  equipment_serial text,
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tech_forms" ON public.tech_forms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert tech_forms" ON public.tech_forms
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow anon insert for public SMS form links
CREATE POLICY "Anon can insert tech_forms" ON public.tech_forms
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can read tech_forms" ON public.tech_forms
  FOR SELECT TO anon USING (true);

-- 8. Tech form photos
CREATE TABLE public.tech_form_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_form_id uuid REFERENCES public.tech_forms(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  photo_type text DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_form_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All can read tech_form_photos" ON public.tech_form_photos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "All can insert tech_form_photos" ON public.tech_form_photos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anon can insert tech_form_photos" ON public.tech_form_photos
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can read tech_form_photos" ON public.tech_form_photos
  FOR SELECT TO anon USING (true);

-- 9. Paysheet entries table
CREATE TABLE public.paysheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  tech_form_id uuid REFERENCES public.tech_forms(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  pay_week_start date NOT NULL,
  pay_week_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.paysheet_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage paysheet" ON public.paysheet_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Techs can read own paysheet" ON public.paysheet_entries
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT p.employee_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Office can read all paysheet" ON public.paysheet_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'office'));

-- 10. Pay rates table (flat rate per job type)
CREATE TABLE public.pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL UNIQUE,
  rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read pay_rates" ON public.pay_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage pay_rates" ON public.pay_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default pay rates
INSERT INTO public.pay_rates (job_type, rate) VALUES
  ('install', 200),
  ('service', 100),
  ('maintenance', 75),
  ('repair', 100);

-- 11. Storage bucket for tech form photos
INSERT INTO storage.buckets (id, name, public) VALUES ('tech-form-photos', 'tech-form-photos', true);

-- Storage policies for tech-form-photos
CREATE POLICY "Anyone can upload tech form photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'tech-form-photos');

CREATE POLICY "Anyone can view tech form photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'tech-form-photos');
