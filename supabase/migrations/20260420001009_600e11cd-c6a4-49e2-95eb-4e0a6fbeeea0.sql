
-- 1. Create overrides table
CREATE TABLE IF NOT EXISTS public.email_category_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('system','marketing','customer','personal','vendor','supply_house')),
  is_suffix boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_category_overrides_domain ON public.email_category_overrides(domain);

ALTER TABLE public.email_category_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email category overrides"
  ON public.email_category_overrides
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users read email category overrides"
  ON public.email_category_overrides
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_email_category_overrides_updated_at
  BEFORE UPDATE ON public.email_category_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed overrides
INSERT INTO public.email_category_overrides (domain, category, is_suffix, notes) VALUES
  ('google.com', 'system', false, 'Google Workspace notifications'),
  ('accounts.google.com', 'system', false, 'Google account alerts'),
  ('googlemail.com', 'system', false, 'Gmail system notices'),
  ('housecallpro.com', 'system', true, 'HCP CRM (suffix match)'),
  ('notification.intuit.com', 'system', false, 'QuickBooks notifications'),
  ('twilio.com', 'system', true, 'Twilio platform (suffix)'),
  ('3cx.net', 'system', false, '3CX phone system'),
  ('docusign.net', 'system', false, 'DocuSign'),
  ('fedex.com', 'system', false, 'FedEx shipping'),
  ('messaging.squareup.com', 'system', false, 'Square messaging'),
  ('notifications.t-mobile.com', 'system', false, 'T-Mobile notifications'),
  ('godaddy.com', 'system', false, 'GoDaddy'),
  ('mail.conversations.godaddy.com', 'system', false, 'GoDaddy conversations'),
  ('public.govdelivery.com', 'system', false, 'Government delivery'),
  ('txt.texas.gov', 'system', false, 'Texas gov notices'),
  ('alwaysanswer.com', 'system', false, 'Answering service'),
  ('email.monarch.com', 'system', false, 'Monarch banking'),
  ('mailchimp.com', 'system', false, 'Mailchimp platform'),
  ('business-updates.facebook.com', 'marketing', false, 'Facebook ads'),
  ('jointeamwave.com', 'marketing', false, 'Cold sales'),
  ('zohostore.com', 'marketing', false, 'Cold sales'),
  ('gong.io', 'marketing', false, 'Cold sales'),
  ('yardi.com', 'marketing', false, 'Cold sales'),
  ('regus.com', 'marketing', false, 'Cold sales'),
  ('zyte.com', 'marketing', false, 'Cold sales'),
  ('twilio.zendesk.com', 'marketing', false, 'Twilio support marketing')
ON CONFLICT (domain) DO NOTHING;

-- 3. Backfill emails table — exact-match domains
UPDATE public.emails e
SET category = o.category
FROM public.email_category_overrides o
WHERE o.is_suffix = false
  AND lower(split_part(e.from_address, '@', 2)) = lower(o.domain)
  AND e.category = 'vendor';

-- 4. Backfill emails table — suffix-match domains (e.g., *.housecallpro.com, *.twilio.com)
UPDATE public.emails e
SET category = o.category
FROM public.email_category_overrides o
WHERE o.is_suffix = true
  AND (
    lower(split_part(e.from_address, '@', 2)) = lower(o.domain)
    OR lower(split_part(e.from_address, '@', 2)) LIKE '%.' || lower(o.domain)
  )
  AND e.category = 'vendor';
