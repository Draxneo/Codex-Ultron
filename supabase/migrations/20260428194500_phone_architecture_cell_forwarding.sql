ALTER TABLE public.ivr_menu_options
  ADD COLUMN IF NOT EXISTS inbound_route_mode text NOT NULL DEFAULT 'cell_forwarding',
  ADD COLUMN IF NOT EXISTS ring_strategy text NOT NULL DEFAULT 'simultaneous',
  ADD COLUMN IF NOT EXISTS ring_timeout_seconds integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ivr_menu_options_inbound_route_mode_check'
  ) THEN
    ALTER TABLE public.ivr_menu_options
      ADD CONSTRAINT ivr_menu_options_inbound_route_mode_check
      CHECK (inbound_route_mode IN ('cell_forwarding', 'softphone', 'both'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ivr_menu_options_ring_timeout_check'
  ) THEN
    ALTER TABLE public.ivr_menu_options
      ADD CONSTRAINT ivr_menu_options_ring_timeout_check
      CHECK (ring_timeout_seconds IS NULL OR (ring_timeout_seconds >= 10 AND ring_timeout_seconds <= 60));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.department_forwarding_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_key text NOT NULL CHECK (department_key IN ('sales', 'service', 'billing', 'general')),
  label text NOT NULL DEFAULT 'Cell',
  phone_number text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_department_forwarding_numbers_department
  ON public.department_forwarding_numbers (department_key, enabled, priority);

ALTER TABLE public.department_forwarding_numbers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'department_forwarding_numbers'
      AND policyname = 'authenticated read department forwarding numbers'
  ) THEN
    CREATE POLICY "authenticated read department forwarding numbers"
      ON public.department_forwarding_numbers
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'department_forwarding_numbers'
      AND policyname = 'admins manage department forwarding numbers'
  ) THEN
    CREATE POLICY "admins manage department forwarding numbers"
      ON public.department_forwarding_numbers
      FOR ALL
      USING (public.has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_department_forwarding_numbers_updated_at ON public.department_forwarding_numbers;
CREATE TRIGGER trg_department_forwarding_numbers_updated_at
  BEFORE UPDATE ON public.department_forwarding_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.call_log
  ADD COLUMN IF NOT EXISTS parent_call_sid text,
  ADD COLUMN IF NOT EXISTS department_key text,
  ADD COLUMN IF NOT EXISTS route_type text;

CREATE INDEX IF NOT EXISTS idx_call_log_department_key
  ON public.call_log (department_key);

CREATE INDEX IF NOT EXISTS idx_call_log_parent_call_sid
  ON public.call_log (parent_call_sid);
