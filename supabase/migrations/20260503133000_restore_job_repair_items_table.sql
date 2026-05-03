-- Restore the tech job repair item table expected by dispatch live cards and service pricebook hooks.
-- This table is separate from service_repair_items, which powers customer-facing repair quote proposals.

CREATE TABLE IF NOT EXISTS public.job_repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pricebook_item_id uuid REFERENCES public.service_pricebook(id),
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  severity text DEFAULT 'recommended',
  notes text,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_repair_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_job_repair_items_job_id_created_at
  ON public.job_repair_items (job_id, created_at DESC);

DROP POLICY IF EXISTS "Anyone can read job repair items" ON public.job_repair_items;
CREATE POLICY "Anyone can read job repair items"
  ON public.job_repair_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert job repair items" ON public.job_repair_items;
CREATE POLICY "Anyone can insert job repair items"
  ON public.job_repair_items FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update job repair items" ON public.job_repair_items;
CREATE POLICY "Anyone can update job repair items"
  ON public.job_repair_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete job repair items" ON public.job_repair_items;
CREATE POLICY "Anyone can delete job repair items"
  ON public.job_repair_items FOR DELETE
  USING (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_repair_items;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
