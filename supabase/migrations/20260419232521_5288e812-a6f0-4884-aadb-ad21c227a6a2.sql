ALTER TABLE public.job_invoices
ADD COLUMN IF NOT EXISTS po_number text;

CREATE INDEX IF NOT EXISTS idx_job_invoices_po_number
ON public.job_invoices (po_number)
WHERE po_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pending_vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email text NOT NULL,
  sender_name text,
  sender_domain text,
  phone_guess text,
  suggested_vendor_id uuid REFERENCES public.supply_houses(id) ON DELETE SET NULL,
  suggested_vendor_name text,
  source_email_id uuid REFERENCES public.emails(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  occurrence_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_email)
);

CREATE INDEX IF NOT EXISTS idx_pending_vendor_contacts_status
ON public.pending_vendor_contacts (status, last_seen_at DESC);

ALTER TABLE public.pending_vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/office can view pending vendor contacts"
ON public.pending_vendor_contacts FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
);

CREATE POLICY "Admins/office can manage pending vendor contacts"
ON public.pending_vendor_contacts FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
);

CREATE POLICY "Service role can insert pending vendor contacts"
ON public.pending_vendor_contacts FOR INSERT
TO service_role
WITH CHECK (true);