
-- Job reminders table
CREATE TABLE public.job_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  reminder_type text NOT NULL DEFAULT 'day_before',
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  customer_response text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to job_reminders" ON public.job_reminders FOR ALL USING (true) WITH CHECK (true);

-- Customer portal codes
CREATE TABLE public.customer_portal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used boolean NOT NULL DEFAULT false
);
ALTER TABLE public.customer_portal_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon can manage portal codes" ON public.customer_portal_codes FOR ALL USING (true) WITH CHECK (true);

-- Customer portal sessions
CREATE TABLE public.customer_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
ALTER TABLE public.customer_portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon can read portal sessions" ON public.customer_portal_sessions FOR SELECT USING (true);
CREATE POLICY "Authenticated manage portal sessions" ON public.customer_portal_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Referral codes
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  bonus_type text NOT NULL DEFAULT '$50 service credit',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read referral codes" ON public.referral_codes FOR SELECT USING (true);
CREATE POLICY "Authenticated manage referral codes" ON public.referral_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Referrals
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_code text NOT NULL,
  referred_name text NOT NULL,
  referred_phone text,
  referred_email text,
  referred_address text,
  service_needed text,
  status text NOT NULL DEFAULT 'pending',
  bonus_awarded boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert referrals" ON public.referrals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read referrals" ON public.referrals FOR SELECT USING (true);
CREATE POLICY "Authenticated manage referrals" ON public.referrals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- On My Way tracking
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS on_my_way_sent_at timestamptz;

-- Auto-create reminders trigger
CREATE OR REPLACE FUNCTION public.create_job_reminders() RETURNS trigger AS $$
BEGIN
  IF NEW.scheduled_date IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date) THEN
    DELETE FROM public.job_reminders WHERE job_id = NEW.id AND status = 'pending';
    INSERT INTO public.job_reminders (job_id, reminder_type, scheduled_for)
    VALUES
      (NEW.id, 'day_before', (NEW.scheduled_date::date - 1) + time '09:00'),
      (NEW.id, 'morning_of', NEW.scheduled_date::date + time '07:00');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_create_job_reminders
  AFTER INSERT OR UPDATE OF scheduled_date ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.create_job_reminders();
