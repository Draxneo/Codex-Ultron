CREATE TABLE public.known_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_digits text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_type text NOT NULL DEFAULT 'other',
  notes text,
  auto_action text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phone_digits_10 CHECK (char_length(phone_digits) = 10 AND phone_digits ~ '^[0-9]+$'),
  CONSTRAINT contact_type_valid CHECK (contact_type IN ('vendor','marketing','answering_service','tech_partner','spam','personal','other')),
  CONSTRAINT auto_action_valid CHECK (auto_action IS NULL OR auto_action IN ('mute','surface_only','route_to_admin'))
);

CREATE INDEX idx_known_contacts_phone ON public.known_contacts (phone_digits);

ALTER TABLE public.known_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view known contacts"
  ON public.known_contacts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert known contacts"
  ON public.known_contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update known contacts"
  ON public.known_contacts FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete known contacts"
  ON public.known_contacts FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER known_contacts_updated_at
  BEFORE UPDATE ON public.known_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();