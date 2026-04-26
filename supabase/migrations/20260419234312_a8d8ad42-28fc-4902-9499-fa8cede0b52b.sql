-- Vendor email domain aliases (one vendor → many domains)
CREATE TABLE public.vendor_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.supply_houses(id) ON DELETE CASCADE,
  domain text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(domain)
);

CREATE INDEX idx_vendor_email_domains_vendor ON public.vendor_email_domains(vendor_id);
CREATE INDEX idx_vendor_email_domains_domain ON public.vendor_email_domains(lower(domain));

ALTER TABLE public.vendor_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage vendor email domains"
  ON public.vendor_email_domains FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read vendor email domains"
  ON public.vendor_email_domains FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Pending domains queue (unknown senders awaiting decision)
CREATE TABLE public.pending_vendor_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  email_count integer NOT NULL DEFAULT 1,
  sample_from_name text,
  sample_from_address text,
  sample_subject text,
  status text NOT NULL DEFAULT 'pending', -- pending | linked | created | skipped
  resolved_vendor_id uuid REFERENCES public.supply_houses(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_vendor_domains_status ON public.pending_vendor_domains(status);

ALTER TABLE public.pending_vendor_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pending vendor domains"
  ON public.pending_vendor_domains FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed known mappings based on existing vendors + observed domains
INSERT INTO public.vendor_email_domains (vendor_id, domain, notes) VALUES
  ((SELECT id FROM public.supply_houses WHERE name = 'Robert Madden'), 'rmadden.com', 'Direct invoices'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Robert Madden'), 'sibipro.com', 'SIBI ordering portal (Robert Madden)'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Carrier Enterprise'), 'carrierenterprise.com', 'Primary domain'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Carrier Enterprise'), 'carrierenterprise.net', 'Marketing domain'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Carrier Enterprise'), 'e.carrier.com', 'Carrier corporate emails'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Century A/C Supply'), 'centuryhvac.com', 'Primary domain'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Johnson Supply'), 'johnsonsupply.com', 'Primary domain'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Trane Supply'), 'tranetechnologies.com', 'Trane corporate'),
  ((SELECT id FROM public.supply_houses WHERE name = 'Trane Supply'), 'shared1.ccsend.com', 'Trane Constant Contact campaigns')
ON CONFLICT (domain) DO NOTHING;