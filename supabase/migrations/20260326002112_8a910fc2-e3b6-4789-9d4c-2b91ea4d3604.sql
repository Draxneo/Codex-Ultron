
CREATE TABLE public.ce_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ce_order_number text NOT NULL,
  item_number text,
  mfr_number text,
  description text,
  serial_number text,
  quantity integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ce_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage CE order items"
  ON public.ce_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_ce_order_items_job_id ON public.ce_order_items(job_id);
CREATE INDEX idx_ce_order_items_ce_order ON public.ce_order_items(ce_order_number);
