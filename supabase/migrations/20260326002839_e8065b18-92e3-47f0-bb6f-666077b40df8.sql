
CREATE TABLE public.order_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  job_type text,
  system_type text,
  orientation text,
  item_number text,
  mfr_number text,
  description text,
  avg_quantity numeric DEFAULT 1,
  avg_unit_price numeric DEFAULT 0,
  frequency int DEFAULT 1,
  total_jobs_in_category int DEFAULT 0,
  image_url text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(category, item_number)
);

ALTER TABLE public.order_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read order_patterns"
  ON public.order_patterns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert order_patterns"
  ON public.order_patterns FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update order_patterns"
  ON public.order_patterns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete order_patterns"
  ON public.order_patterns FOR DELETE TO authenticated USING (true);
