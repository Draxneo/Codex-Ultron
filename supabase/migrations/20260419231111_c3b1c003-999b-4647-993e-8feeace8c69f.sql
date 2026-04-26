CREATE TABLE IF NOT EXISTS public.vendor_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.supply_houses(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_notes_vendor_id_idx ON public.vendor_notes (vendor_id, created_at DESC);

ALTER TABLE public.vendor_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can view vendor notes" ON public.vendor_notes;
CREATE POLICY "Auth users can view vendor notes" ON public.vendor_notes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth users can insert vendor notes" ON public.vendor_notes;
CREATE POLICY "Auth users can insert vendor notes" ON public.vendor_notes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authors can update own notes" ON public.vendor_notes;
CREATE POLICY "Authors can update own notes" ON public.vendor_notes
  FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authors and admins can delete notes" ON public.vendor_notes;
CREATE POLICY "Authors and admins can delete notes" ON public.vendor_notes
  FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_vendor_notes_updated_at
  BEFORE UPDATE ON public.vendor_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();