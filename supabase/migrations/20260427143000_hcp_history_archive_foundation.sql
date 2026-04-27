-- HCP full-history archive foundation.
-- This is intentionally additive: no existing operational data is wiped.

CREATE TABLE IF NOT EXISTS public.hcp_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,
  resource text NOT NULL,
  mode text NOT NULL DEFAULT 'probe',
  status text NOT NULL DEFAULT 'running',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  page integer,
  page_size integer,
  total_pages integer,
  total_items integer,
  fetched_count integer NOT NULL DEFAULT 0,
  normalized_count integer NOT NULL DEFAULT 0,
  archived_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hcp_import_runs_resource_status
  ON public.hcp_import_runs(resource, status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.hcp_raw_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  hcp_id text,
  source_key text NOT NULL,
  parent_source_type text,
  parent_hcp_id text,
  parent_source_key text,
  nested_path text,
  source_url text,
  raw_json jsonb NOT NULL,
  raw_hash text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  normalized_at timestamptz,
  archived_at timestamptz,
  archive_status text NOT NULL DEFAULT 'raw',
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcp_raw_objects_source_key_unique UNIQUE (source_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_hcp_raw_objects_parent
  ON public.hcp_raw_objects(parent_source_type, parent_source_key);
CREATE INDEX IF NOT EXISTS idx_hcp_raw_objects_hcp_id
  ON public.hcp_raw_objects(hcp_id) WHERE hcp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hcp_raw_objects_archive_status
  ON public.hcp_raw_objects(source_type, archive_status);
CREATE INDEX IF NOT EXISTS idx_hcp_raw_objects_raw_json_gin
  ON public.hcp_raw_objects USING gin(raw_json);

CREATE TABLE IF NOT EXISTS public.hcp_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  raw_object_id uuid REFERENCES public.hcp_raw_objects(id) ON DELETE SET NULL,
  resource text NOT NULL,
  source_type text,
  hcp_id text,
  source_key text,
  phase text NOT NULL DEFAULT 'fetch',
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  retryable boolean NOT NULL DEFAULT true,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hcp_import_errors_open
  ON public.hcp_import_errors(resource, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  hcp_estimate_id text,
  hcp_option_id text,
  hcp_line_item_id text,
  option_name text,
  name text,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric,
  total_price numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  kind text,
  item_type text,
  sort_order integer NOT NULL DEFAULT 0,
  raw_hcp_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text,
  import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_line_items_hcp_unique UNIQUE (hcp_estimate_id, hcp_option_id, hcp_line_item_id)
);

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate_id
  ON public.estimate_line_items(estimate_id);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  hcp_payment_id text,
  hcp_invoice_id text,
  amount numeric NOT NULL DEFAULT 0,
  method text,
  status text,
  transaction_id text,
  reference_number text,
  paid_at timestamptz,
  refunded_at timestamptz,
  raw_hcp_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text,
  import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payments_hcp_payment_unique UNIQUE (hcp_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id
  ON public.invoice_payments(customer_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_hcp_invoice_id
  ON public.invoice_payments(hcp_invoice_id);

CREATE TABLE IF NOT EXISTS public.hcp_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid,
  hcp_source_id text,
  hcp_note_id text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'internal',
  author_name text,
  body text NOT NULL,
  note_created_at timestamptz,
  raw_hcp_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text,
  import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcp_notes_identity_unique UNIQUE (source_type, hcp_source_id, hcp_note_id)
);

CREATE INDEX IF NOT EXISTS idx_hcp_notes_customer_id ON public.hcp_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_hcp_notes_job_id ON public.hcp_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_hcp_notes_estimate_id ON public.hcp_notes(estimate_id);

CREATE TABLE IF NOT EXISTS public.hcp_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid,
  hcp_source_id text,
  hcp_attachment_id text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  equipment_id uuid,
  file_name text NOT NULL DEFAULT 'attachment',
  file_type text,
  original_url text,
  storage_bucket text,
  storage_path text,
  file_size bigint,
  checksum text,
  uploaded_at timestamptz,
  archive_status text NOT NULL DEFAULT 'metadata',
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  raw_hcp_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text,
  import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcp_attachments_identity_unique UNIQUE (source_type, hcp_source_id, hcp_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_hcp_attachments_customer_id ON public.hcp_attachments(customer_id);
CREATE INDEX IF NOT EXISTS idx_hcp_attachments_job_id ON public.hcp_attachments(job_id);
CREATE INDEX IF NOT EXISTS idx_hcp_attachments_estimate_id ON public.hcp_attachments(estimate_id);
CREATE INDEX IF NOT EXISTS idx_hcp_attachments_archive_status
  ON public.hcp_attachments(source_type, archive_status);

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS hcp_status text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS total_amount numeric,
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS hcp_invoice_id text,
  ADD COLUMN IF NOT EXISTS hcp_customer_id text,
  ADD COLUMN IF NOT EXISTS hcp_job_id text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS balance numeric,
  ADD COLUMN IF NOT EXISTS amount_paid numeric,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hcp_invoice_url text,
  ADD COLUMN IF NOT EXISTS hcp_pdf_url text,
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoices_hcp_invoice_id_unique
  ON public.customer_invoices(hcp_invoice_id)
  WHERE hcp_invoice_id IS NOT NULL;

ALTER TABLE public.customer_invoice_items
  ADD COLUMN IF NOT EXISTS hcp_line_item_id text,
  ADD COLUMN IF NOT EXISTS hcp_invoice_id text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS unit_cost numeric,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_invoice_items_hcp_invoice_id
  ON public.customer_invoice_items(hcp_invoice_id);

ALTER TABLE public.job_line_items
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.job_attachments
  ADD COLUMN IF NOT EXISTS original_url text,
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'job-photos',
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'archived',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS raw_hcp_json jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.hcp_import_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_attachments_hcp_attachment_id_unique
  ON public.job_attachments(hcp_attachment_id)
  WHERE hcp_attachment_id IS NOT NULL;

ALTER TABLE public.hcp_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcp_raw_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcp_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcp_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcp_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read hcp import runs" ON public.hcp_import_runs;
CREATE POLICY "Authenticated can read hcp import runs"
  ON public.hcp_import_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service can manage hcp import runs" ON public.hcp_import_runs;

DROP POLICY IF EXISTS "Authenticated can read hcp raw objects" ON public.hcp_raw_objects;
CREATE POLICY "Authenticated can read hcp raw objects"
  ON public.hcp_raw_objects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service can manage hcp raw objects" ON public.hcp_raw_objects;

DROP POLICY IF EXISTS "Authenticated can read hcp import errors" ON public.hcp_import_errors;
CREATE POLICY "Authenticated can read hcp import errors"
  ON public.hcp_import_errors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service can manage hcp import errors" ON public.hcp_import_errors;

DROP POLICY IF EXISTS "Allow all access to estimate_line_items" ON public.estimate_line_items;
CREATE POLICY "Allow all access to estimate_line_items"
  ON public.estimate_line_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to invoice_payments" ON public.invoice_payments;
CREATE POLICY "Allow all access to invoice_payments"
  ON public.invoice_payments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to hcp_notes" ON public.hcp_notes;
CREATE POLICY "Allow all access to hcp_notes"
  ON public.hcp_notes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to hcp_attachments" ON public.hcp_attachments;
CREATE POLICY "Allow all access to hcp_attachments"
  ON public.hcp_attachments FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_hcp_import_runs_updated_at ON public.hcp_import_runs;
CREATE TRIGGER update_hcp_import_runs_updated_at
  BEFORE UPDATE ON public.hcp_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hcp_raw_objects_updated_at ON public.hcp_raw_objects;
CREATE TRIGGER update_hcp_raw_objects_updated_at
  BEFORE UPDATE ON public.hcp_raw_objects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_estimate_line_items_updated_at ON public.estimate_line_items;
CREATE TRIGGER update_estimate_line_items_updated_at
  BEFORE UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoice_payments_updated_at ON public.invoice_payments;
CREATE TRIGGER update_invoice_payments_updated_at
  BEFORE UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hcp_notes_updated_at ON public.hcp_notes;
CREATE TRIGGER update_hcp_notes_updated_at
  BEFORE UPDATE ON public.hcp_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hcp_attachments_updated_at ON public.hcp_attachments;
CREATE TRIGGER update_hcp_attachments_updated_at
  BEFORE UPDATE ON public.hcp_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('customer-attachments', 'customer-attachments', true),
  ('estimate-attachments', 'estimate-attachments', true),
  ('equipment-attachments', 'equipment-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read customer attachments" ON storage.objects;
CREATE POLICY "Allow public read customer attachments"
  ON storage.objects FOR SELECT USING (bucket_id = 'customer-attachments');
DROP POLICY IF EXISTS "Allow insert customer attachments" ON storage.objects;
CREATE POLICY "Allow insert customer attachments"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'customer-attachments');
DROP POLICY IF EXISTS "Allow delete customer attachments" ON storage.objects;
CREATE POLICY "Allow delete customer attachments"
  ON storage.objects FOR DELETE USING (bucket_id = 'customer-attachments');

DROP POLICY IF EXISTS "Allow public read estimate attachments" ON storage.objects;
CREATE POLICY "Allow public read estimate attachments"
  ON storage.objects FOR SELECT USING (bucket_id = 'estimate-attachments');
DROP POLICY IF EXISTS "Allow insert estimate attachments" ON storage.objects;
CREATE POLICY "Allow insert estimate attachments"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'estimate-attachments');
DROP POLICY IF EXISTS "Allow delete estimate attachments" ON storage.objects;
CREATE POLICY "Allow delete estimate attachments"
  ON storage.objects FOR DELETE USING (bucket_id = 'estimate-attachments');

DROP POLICY IF EXISTS "Allow public read equipment attachments" ON storage.objects;
CREATE POLICY "Allow public read equipment attachments"
  ON storage.objects FOR SELECT USING (bucket_id = 'equipment-attachments');
DROP POLICY IF EXISTS "Allow insert equipment attachments" ON storage.objects;
CREATE POLICY "Allow insert equipment attachments"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'equipment-attachments');
DROP POLICY IF EXISTS "Allow delete equipment attachments" ON storage.objects;
CREATE POLICY "Allow delete equipment attachments"
  ON storage.objects FOR DELETE USING (bucket_id = 'equipment-attachments');
