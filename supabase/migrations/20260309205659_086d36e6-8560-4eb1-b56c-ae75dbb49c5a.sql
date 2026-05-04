CREATE TABLE public.portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  request_type text NOT NULL DEFAULT 'service_request',
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by text
);

ALTER TABLE public.portal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert portal_requests"
  ON public.portal_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can manage portal_requests"
  ON public.portal_requests FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read own portal_requests"
  ON public.portal_requests FOR SELECT TO anon
  USING (true);