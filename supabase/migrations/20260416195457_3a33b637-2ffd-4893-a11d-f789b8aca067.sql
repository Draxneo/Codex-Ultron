-- Cart read receipts + recovery automation columns
ALTER TABLE public.job_carts
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_pdf_url text,
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;

-- Public RPC: track a cart view (called from CustomerCart page).
-- Bumps view_count, sets first_viewed_at on first hit, last_viewed_at on every hit.
CREATE OR REPLACE FUNCTION public.track_cart_view(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.job_carts
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = view_count + 1
  WHERE public_token = p_token
    AND status NOT IN ('paid','canceled','declined');
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_cart_view(uuid) TO anon, authenticated;

-- Realtime support for the carts table so the tech sees view updates live
ALTER TABLE public.job_carts REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='job_carts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.job_carts';
  END IF;
END $$;