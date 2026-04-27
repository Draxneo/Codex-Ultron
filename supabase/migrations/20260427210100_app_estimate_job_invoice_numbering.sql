-- UltraOffice-owned numbering and Estimate -> Invoice conversion.
-- HCP history remains untouched; new app records start at 12234.

CREATE SEQUENCE IF NOT EXISTS public.ultraoffice_work_number_seq START WITH 12234;

DO $$
DECLARE
  _current bigint;
  _target bigint := 12233;
BEGIN
  SELECT last_value INTO _current FROM public.ultraoffice_work_number_seq;
  IF _current < _target THEN
    PERFORM setval('public.ultraoffice_work_number_seq', _target, true);
  END IF;
END $$;

ALTER TABLE public.job_carts
  ADD COLUMN IF NOT EXISTS estimate_number text,
  ADD COLUMN IF NOT EXISTS selected_invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimate_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_invoice_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS job_carts_estimate_number_unique
  ON public.job_carts(estimate_number)
  WHERE estimate_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_carts_selected_invoice_id
  ON public.job_carts(selected_invoice_id);

CREATE OR REPLACE FUNCTION public.next_ultraoffice_work_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN nextval('public.ultraoffice_work_number_seq')::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_job_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_number IS NULL AND NEW.hcp_id IS NULL THEN
    NEW.job_number := public.next_ultraoffice_work_number();
  ELSIF NEW.job_number IS NULL AND NEW.hcp_job_number IS NOT NULL THEN
    NEW.job_number := NEW.hcp_job_number;
  END IF;

  IF NEW.hcp_id IS NULL AND NEW.hcp_job_number IS NULL AND NEW.job_number IS NOT NULL THEN
    NEW.hcp_job_number := NEW.job_number;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_estimate_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estimate_number IS NULL AND NEW.hcp_id IS NULL THEN
    NEW.estimate_number := 'EST-' || public.next_ultraoffice_work_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_estimate_number ON public.estimates;
CREATE TRIGGER set_estimate_number
  BEFORE INSERT ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_estimate_number();

CREATE OR REPLACE FUNCTION public.assign_job_cart_estimate_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_number text;
  _base text;
  _candidate text;
  _suffix integer := 1;
BEGIN
  IF NEW.estimate_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(job_number, hcp_job_number, id::text)
  INTO _job_number
  FROM public.jobs
  WHERE id = NEW.job_id;

  _base := 'EST-' || COALESCE(_job_number, public.next_ultraoffice_work_number());
  _candidate := _base;

  WHILE EXISTS (
    SELECT 1
    FROM public.job_carts
    WHERE estimate_number = _candidate
      AND id IS DISTINCT FROM NEW.id
  ) LOOP
    _suffix := _suffix + 1;
    _candidate := _base || '-' || _suffix::text;
  END LOOP;

  NEW.estimate_number := _candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_job_cart_estimate_number ON public.job_carts;
CREATE TRIGGER set_job_cart_estimate_number
  BEFORE INSERT ON public.job_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_job_cart_estimate_number();

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_number text;
  _base text;
  _candidate text;
  _suffix integer := 1;
BEGIN
  IF NEW.invoice_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(job_number, hcp_job_number)
  INTO _job_number
  FROM public.jobs
  WHERE id = NEW.job_id;

  IF _job_number IS NULL THEN
    _base := 'INV-' || public.next_ultraoffice_work_number();
  ELSE
    _base := 'INV-' || _job_number;
  END IF;

  _candidate := _base;
  WHILE EXISTS (
    SELECT 1
    FROM public.customer_invoices
    WHERE invoice_number = _candidate
      AND id IS DISTINCT FROM NEW.id
  ) LOOP
    _suffix := _suffix + 1;
    _candidate := _base || '-' || _suffix::text;
  END LOOP;

  NEW.invoice_number := _candidate;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_approved_job_cart()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invoice_id uuid;
  _invoice_status text;
BEGIN
  IF NEW.status NOT IN ('approved', 'paid') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.selected_invoice_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  _invoice_status := CASE WHEN NEW.status = 'paid' THEN 'paid' ELSE 'sent' END;

  INSERT INTO public.customer_invoices (
    job_id,
    status,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    notes,
    sent_at,
    paid_at
  )
  VALUES (
    NEW.job_id,
    _invoice_status,
    COALESCE(NEW.subtotal, 0),
    COALESCE(NEW.tax_rate, 0),
    COALESCE(NEW.tax_amount, 0),
    COALESCE(NEW.total, 0),
    'Created from Estimate ' || COALESCE(NEW.estimate_number, NEW.id::text),
    now(),
    CASE WHEN NEW.status = 'paid' THEN now() ELSE NULL END
  )
  RETURNING id INTO _invoice_id;

  INSERT INTO public.customer_invoice_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    total,
    sort_order,
    name,
    kind,
    raw_hcp_json
  )
  SELECT
    _invoice_id,
    COALESCE(NULLIF(i.description, ''), i.name),
    COALESCE(i.quantity, 1),
    COALESCE(i.unit_price, 0),
    COALESCE(i.total_price, 0),
    COALESCE(i.sort_order, 0),
    i.name,
    i.kind,
    jsonb_build_object(
      'source', 'job_cart',
      'job_cart_id', NEW.id,
      'job_cart_item_id', i.id,
      'tier', i.tier,
      'metadata', COALESCE(i.metadata, '{}'::jsonb)
    )
  FROM public.job_cart_items i
  WHERE i.cart_id = NEW.id
  ORDER BY i.sort_order, i.created_at;

  UPDATE public.job_carts
  SET selected_invoice_id = _invoice_id,
      converted_invoice_at = now(),
      updated_at = now()
  WHERE id = NEW.id;

  UPDATE public.jobs
  SET primary_invoice_id = COALESCE(primary_invoice_id, _invoice_id),
      invoice_sent_at = COALESCE(invoice_sent_at, now()),
      payment_collected_at = CASE WHEN NEW.status = 'paid' THEN COALESCE(payment_collected_at, now()) ELSE payment_collected_at END
  WHERE id = NEW.job_id;

  INSERT INTO public.activity_log (job_id, action, performed_by, details)
  VALUES (
    NEW.job_id,
    'estimate_converted_to_invoice',
    'system',
    'Estimate ' || COALESCE(NEW.estimate_number, NEW.id::text) || ' created invoice.'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_invoice_from_approved_job_cart ON public.job_carts;
CREATE TRIGGER trg_create_invoice_from_approved_job_cart
  AFTER UPDATE OF status ON public.job_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.create_invoice_from_approved_job_cart();

WITH numbered_jobs AS (
  SELECT id, (12233 + row_number() OVER (ORDER BY created_at, id))::text AS new_number
  FROM public.jobs
  WHERE hcp_id IS NULL
    AND job_number IS NULL
)
UPDATE public.jobs j
SET job_number = n.new_number,
    hcp_job_number = COALESCE(j.hcp_job_number, n.new_number)
FROM numbered_jobs n
WHERE j.id = n.id;

UPDATE public.jobs
SET hcp_job_number = job_number
WHERE hcp_id IS NULL
  AND hcp_job_number IS NULL
  AND job_number IS NOT NULL;

DO $$
DECLARE
  _max_native bigint;
BEGIN
  SELECT GREATEST(
    12233,
    COALESCE(MAX(CASE WHEN job_number ~ '^[0-9]+$' THEN job_number::bigint END), 12233)
  )
  INTO _max_native
  FROM public.jobs
  WHERE hcp_id IS NULL;

  PERFORM setval('public.ultraoffice_work_number_seq', _max_native, true);
END $$;

WITH cart_bases AS (
  SELECT
    jc.id,
    'EST-' || COALESCE(j.job_number, j.hcp_job_number, j.id::text) AS base_number,
    jc.created_at
  FROM public.job_carts jc
  JOIN public.jobs j ON j.id = jc.job_id
  WHERE jc.estimate_number IS NULL
),
cart_numbers AS (
  SELECT
    id,
    base_number ||
      CASE
        WHEN row_number() OVER (PARTITION BY base_number ORDER BY created_at, id) = 1 THEN ''
        ELSE '-' || row_number() OVER (PARTITION BY base_number ORDER BY created_at, id)::text
      END AS new_number
  FROM cart_bases
)
UPDATE public.job_carts jc
SET estimate_number = cn.new_number
FROM cart_numbers cn
WHERE jc.id = cn.id;

COMMENT ON COLUMN public.job_carts.estimate_number IS
  'Customer-facing Estimate number for the selectable repair/replacement options flow.';

COMMENT ON COLUMN public.job_carts.selected_invoice_id IS
  'Invoice created from the approved Estimate/cart scope.';
