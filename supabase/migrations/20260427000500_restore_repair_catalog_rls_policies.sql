-- The imported UltraOffice2.0 database had RLS enabled on repair_catalog but
-- no policies, which made the browser UI see 0 repairs even though the table
-- had active rows. Restore authenticated app access.

ALTER TABLE public.repair_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read repair_catalog" ON public.repair_catalog;
DROP POLICY IF EXISTS "Authenticated users can insert repair_catalog" ON public.repair_catalog;
DROP POLICY IF EXISTS "Authenticated users can update repair_catalog" ON public.repair_catalog;
DROP POLICY IF EXISTS "Authenticated users can delete repair_catalog" ON public.repair_catalog;

CREATE POLICY "Authenticated users can read repair_catalog"
  ON public.repair_catalog
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert repair_catalog"
  ON public.repair_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update repair_catalog"
  ON public.repair_catalog
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete repair_catalog"
  ON public.repair_catalog
  FOR DELETE
  TO authenticated
  USING (true);
