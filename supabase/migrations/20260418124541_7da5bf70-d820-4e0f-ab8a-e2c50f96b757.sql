
-- ============================================================
-- 1. CUSTOMERS — additive columns
-- ============================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lifetime_value numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_balance numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS text_consent text DEFAULT 'opted_in',
  ADD COLUMN IF NOT EXISTS email_consent text DEFAULT 'opted_in',
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS auto_invoice_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_invoice_settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_payment_method_id text,
  ADD COLUMN IF NOT EXISTS receipt_email text;

-- ============================================================
-- 2. CUSTOMER_NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'customer' CHECK (scope IN ('customer','estimate','job')),
  entity_id uuid,
  author_id uuid,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON public.customer_notes(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notes_scope ON public.customer_notes(customer_id, scope, entity_id);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view customer_notes" ON public.customer_notes;
CREATE POLICY "Authenticated can view customer_notes" ON public.customer_notes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert customer_notes" ON public.customer_notes;
CREATE POLICY "Authenticated can insert customer_notes" ON public.customer_notes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update customer_notes" ON public.customer_notes;
CREATE POLICY "Authenticated can update customer_notes" ON public.customer_notes
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can delete customer_notes" ON public.customer_notes;
CREATE POLICY "Authenticated can delete customer_notes" ON public.customer_notes
  FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_customer_notes_updated_at ON public.customer_notes;
CREATE TRIGGER trg_customer_notes_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. CUSTOMER_PORTAL_INVITES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_portal_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email text,
  phone text,
  sent_by uuid,
  sent_by_name text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','expired','failed'))
);

CREATE INDEX IF NOT EXISTS idx_portal_invites_customer ON public.customer_portal_invites(customer_id, sent_at DESC);

ALTER TABLE public.customer_portal_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view portal_invites" ON public.customer_portal_invites;
CREATE POLICY "Authenticated can view portal_invites" ON public.customer_portal_invites
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert portal_invites" ON public.customer_portal_invites;
CREATE POLICY "Authenticated can insert portal_invites" ON public.customer_portal_invites
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update portal_invites" ON public.customer_portal_invites;
CREATE POLICY "Authenticated can update portal_invites" ON public.customer_portal_invites
  FOR UPDATE TO authenticated USING (true);

-- ============================================================
-- 4. CUSTOMER_ACTIVITY_FEED
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  related_job_id uuid,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  source text DEFAULT 'system',
  actor_id uuid,
  actor_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_customer ON public.customer_activity_feed(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_job ON public.customer_activity_feed(related_job_id);

ALTER TABLE public.customer_activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view activity_feed" ON public.customer_activity_feed;
CREATE POLICY "Authenticated can view activity_feed" ON public.customer_activity_feed
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert activity_feed" ON public.customer_activity_feed;
CREATE POLICY "Authenticated can insert activity_feed" ON public.customer_activity_feed
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 5. ACTIVITY FEED TRIGGERS
-- ============================================================

-- Notes → activity
CREATE OR REPLACE FUNCTION public.activity_from_customer_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.customer_activity_feed (customer_id, event_type, title, body, source, actor_id, actor_name, metadata)
  VALUES (
    NEW.customer_id,
    'note_added',
    COALESCE(NEW.author_name, 'Someone') || ' added a note',
    LEFT(NEW.body, 500),
    'web',
    NEW.author_id,
    NEW.author_name,
    jsonb_build_object('note_id', NEW.id, 'scope', NEW.scope, 'entity_id', NEW.entity_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_from_customer_note ON public.customer_notes;
CREATE TRIGGER trg_activity_from_customer_note
  AFTER INSERT ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.activity_from_customer_note();

-- Calls → activity (when a customer is linked)
CREATE OR REPLACE FUNCTION public.activity_from_call_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.related_customer_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.customer_activity_feed (customer_id, event_type, title, body, source, metadata)
  VALUES (
    NEW.related_customer_id,
    CASE WHEN NEW.direction = 'inbound' THEN 'call_inbound' ELSE 'call_outbound' END,
    CASE WHEN NEW.direction = 'inbound' THEN 'Inbound call' ELSE 'Outbound call' END
      || COALESCE(' from ' || NEW.contact_name, ''),
    NEW.ai_summary,
    'system',
    jsonb_build_object('call_id', NEW.id, 'duration', NEW.duration_seconds, 'phone', NEW.phone_number)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_from_call_log ON public.call_log;
CREATE TRIGGER trg_activity_from_call_log
  AFTER INSERT ON public.call_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_from_call_log();

-- Invoices → activity
CREATE OR REPLACE FUNCTION public.activity_from_customer_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _customer_id uuid;
BEGIN
  SELECT customer_id INTO _customer_id FROM public.jobs WHERE id = NEW.job_id;
  IF _customer_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.customer_activity_feed (customer_id, related_job_id, event_type, title, body, source, metadata)
    VALUES (_customer_id, NEW.job_id, 'invoice_created',
      'Invoice ' || COALESCE(NEW.invoice_number, '') || ' created',
      'Total $' || NEW.total::text, 'system',
      jsonb_build_object('invoice_id', NEW.id, 'total', NEW.total));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'paid' THEN
    INSERT INTO public.customer_activity_feed (customer_id, related_job_id, event_type, title, body, source, metadata)
    VALUES (_customer_id, NEW.job_id, 'payment_received',
      'Payment received',
      'Invoice ' || COALESCE(NEW.invoice_number, '') || ' — $' || NEW.total::text, 'system',
      jsonb_build_object('invoice_id', NEW.id, 'total', NEW.total));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_from_customer_invoice ON public.customer_invoices;
CREATE TRIGGER trg_activity_from_customer_invoice
  AFTER INSERT OR UPDATE ON public.customer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.activity_from_customer_invoice();

-- ============================================================
-- 6. RPC: get_customer_overview
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customer_overview(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _result jsonb;
  _ltv numeric;
  _outstanding numeric;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO _ltv
  FROM public.customer_invoices ci
  JOIN public.jobs j ON j.id = ci.job_id
  WHERE j.customer_id = p_customer_id AND ci.status = 'paid';

  SELECT COALESCE(SUM(total), 0) INTO _outstanding
  FROM public.customer_invoices ci
  JOIN public.jobs j ON j.id = ci.job_id
  WHERE j.customer_id = p_customer_id AND ci.status IN ('sent','draft','overdue');

  SELECT jsonb_build_object(
    'customer', to_jsonb(c.*),
    'lifetime_value', _ltv,
    'outstanding_balance', _outstanding,
    'job_count', COALESCE(jc.cnt, 0),
    'last_job_date', jc.last_job_date,
    'has_install', COALESCE(jc.has_install, false),
    'agreement', CASE WHEN sa.id IS NOT NULL THEN
      jsonb_build_object('status', sa.status, 'plan_name', sa.plan_name, 'end_date', sa.end_date)
      ELSE NULL END,
    'upcoming_appointments', COALESCE((
      SELECT jsonb_agg(row_to_json(j2.*) ORDER BY j2.scheduled_date ASC)
      FROM (
        SELECT id, job_number, customer_name, address, scheduled_date, arrival_start, arrival_end, status, job_type, assigned_to
        FROM public.jobs
        WHERE customer_id = p_customer_id
          AND scheduled_date >= CURRENT_DATE
          AND status NOT IN ('done','invoiced','canceled')
        ORDER BY scheduled_date ASC, arrival_start ASC NULLS LAST
        LIMIT 5
      ) j2
    ), '[]'::jsonb),
    'addresses', COALESCE((
      SELECT jsonb_agg(row_to_json(a.*) ORDER BY a.is_primary DESC, a.created_at ASC)
      FROM public.customer_addresses a
      WHERE a.customer_id = p_customer_id
    ), '[]'::jsonb),
    'recent_notes', COALESCE((
      SELECT jsonb_agg(row_to_json(n.*) ORDER BY n.created_at DESC)
      FROM (
        SELECT id, scope, entity_id, author_name, body, created_at
        FROM public.customer_notes
        WHERE customer_id = p_customer_id
        ORDER BY created_at DESC
        LIMIT 10
      ) n
    ), '[]'::jsonb),
    'latest_portal_invite', (
      SELECT to_jsonb(pi.*)
      FROM public.customer_portal_invites pi
      WHERE pi.customer_id = p_customer_id
      ORDER BY pi.sent_at DESC
      LIMIT 1
    ),
    'tag_list', c.tags
  ) INTO _result
  FROM public.customers c
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt,
           bool_or(j.job_type = 'install') AS has_install,
           max(j.scheduled_date) AS last_job_date
    FROM public.jobs j WHERE j.customer_id = c.id
  ) jc ON true
  LEFT JOIN LATERAL (
    SELECT id, status, plan_name, end_date
    FROM public.service_agreements
    WHERE customer_id = c.id
    ORDER BY end_date DESC
    LIMIT 1
  ) sa ON true
  WHERE c.id = p_customer_id;

  RETURN _result;
END;
$$;
