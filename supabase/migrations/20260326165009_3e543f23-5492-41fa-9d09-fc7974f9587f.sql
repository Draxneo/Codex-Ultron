CREATE TABLE public.vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_house_id uuid NOT NULL REFERENCES public.supply_houses(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  title text,
  notes text,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(supply_house_id, email)
);

ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage vendor contacts"
  ON public.vendor_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);