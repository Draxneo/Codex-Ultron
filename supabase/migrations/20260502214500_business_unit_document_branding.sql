-- Per-company customer document branding.
-- Carnes and FIX can share one app while each keeping its own document logo
-- and billing address on invoices, carts, and customer-facing documents.

ALTER TABLE public.business_units
  ADD COLUMN IF NOT EXISTS document_logo_url text,
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_state text,
  ADD COLUMN IF NOT EXISTS billing_zip text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read company assets'
  ) THEN
    CREATE POLICY "Public read company assets"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'company-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated upload company assets'
  ) THEN
    CREATE POLICY "Authenticated upload company assets"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'company-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated update company assets'
  ) THEN
    CREATE POLICY "Authenticated update company assets"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'company-assets')
      WITH CHECK (bucket_id = 'company-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated delete company assets'
  ) THEN
    CREATE POLICY "Authenticated delete company assets"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'company-assets');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_public_business_unit_settings(p_business_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings jsonb;
  _unit public.business_units%ROWTYPE;
  _company_name text;
  _company_phone text;
  _company_email text;
  _company_address text;
  _company_city text;
  _company_state text;
  _company_zip text;
BEGIN
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO _settings
  FROM public.company_settings
  WHERE key IN (
    'company_name',
    'company_phone',
    'company_email',
    'company_tagline',
    'company_address',
    'company_city',
    'company_state',
    'company_zip',
    'tacla_number',
    'cart_financing_disclaimer'
  );

  IF p_business_unit_id IS NOT NULL THEN
    SELECT *
    INTO _unit
    FROM public.business_units
    WHERE id = p_business_unit_id
      AND is_active = true
    LIMIT 1;
  END IF;

  IF _unit.id IS NULL THEN
    SELECT *
    INTO _unit
    FROM public.business_units
    WHERE is_default = true
      AND is_active = true
    LIMIT 1;
  END IF;

  IF _unit.id IS NULL THEN
    RETURN COALESCE(_settings, '{}'::jsonb);
  END IF;

  _company_name := COALESCE(NULLIF(_unit.billing_name, ''), _unit.legal_name, _unit.display_name);
  _company_phone := COALESCE(NULLIF(_unit.billing_phone, ''), _unit.primary_phone_number, _settings->>'company_phone');
  _company_email := COALESCE(NULLIF(_unit.billing_email, ''), _settings->>'company_email');
  _company_address := COALESCE(NULLIF(_unit.billing_address, ''), _settings->>'company_address');
  _company_city := COALESCE(NULLIF(_unit.billing_city, ''), _settings->>'company_city');
  _company_state := COALESCE(NULLIF(_unit.billing_state, ''), _settings->>'company_state');
  _company_zip := COALESCE(NULLIF(_unit.billing_zip, ''), _settings->>'company_zip');

  RETURN COALESCE(_settings, '{}'::jsonb)
    || jsonb_build_object(
      'company_name', _company_name,
      'company_display_name', _unit.display_name,
      'company_phone', _company_phone,
      'company_email', _company_email,
      'company_address', _company_address,
      'company_city', _company_city,
      'company_state', _company_state,
      'company_zip', _company_zip,
      'company_logo_url', NULLIF(_unit.document_logo_url, ''),
      'billing_name', NULLIF(_unit.billing_name, ''),
      'billing_address', NULLIF(_unit.billing_address, ''),
      'billing_city', NULLIF(_unit.billing_city, ''),
      'billing_state', NULLIF(_unit.billing_state, ''),
      'billing_zip', NULLIF(_unit.billing_zip, ''),
      'billing_email', NULLIF(_unit.billing_email, ''),
      'billing_phone', NULLIF(_unit.billing_phone, ''),
      'business_unit_id', _unit.id,
      'business_unit_slug', _unit.slug,
      'business_unit_tag', COALESCE(_unit.customer_tag, _unit.display_name)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_business_unit_settings(uuid) TO anon, authenticated;
