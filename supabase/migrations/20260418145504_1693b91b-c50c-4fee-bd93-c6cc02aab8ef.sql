-- Weather forecast cache
CREATE TABLE public.weather_forecast_cache (
  forecast_date date PRIMARY KEY,
  condition text NOT NULL DEFAULT 'clear',
  precip_chance int NOT NULL DEFAULT 0,
  precip_inches numeric(5,2) NOT NULL DEFAULT 0,
  temp_high int,
  temp_low int,
  summary text,
  business_hours_rain boolean NOT NULL DEFAULT false,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_forecast_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read weather"
ON public.weather_forecast_cache FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can write weather"
ON public.weather_forecast_cache FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_weather_forecast_date ON public.weather_forecast_cache(forecast_date);

-- Rain-day SMS discount codes
CREATE TABLE public.weather_sms_codes (
  code text PRIMARY KEY,
  discount_amount int NOT NULL DEFAULT 25,
  forecast_date date NOT NULL,
  valid_until date NOT NULL DEFAULT (CURRENT_DATE + interval '90 days'),
  jobs_targeted int NOT NULL DEFAULT 0,
  redeemed_at timestamptz,
  redeemed_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_sms_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read weather codes"
ON public.weather_sms_codes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage weather codes"
ON public.weather_sms_codes FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Seed company_settings with weather knobs (only if missing)
INSERT INTO public.company_settings (key, value)
VALUES
  ('weather_forecast_enabled', 'true'),
  ('weather_rain_threshold', '60'),
  ('rain_day_sms_template',
   'Hi {first_name}, {company_name} here. Heavy rain is forecast for {day} which may delay your {job_type} appointment. Want to reschedule? Reply YES and we''ll find a dry slot — plus use code {code} for $25 off your next repair. Thanks!')
ON CONFLICT (key) DO NOTHING;