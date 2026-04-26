CREATE POLICY "Public can read public company branding"
ON public.company_settings
FOR SELECT
TO anon
USING (key IN ('company_name','company_phone','company_email','company_address','company_city','company_state','company_zip','company_tagline','company_logo_url'));