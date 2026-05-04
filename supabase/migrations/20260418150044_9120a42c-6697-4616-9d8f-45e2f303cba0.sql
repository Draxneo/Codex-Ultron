ALTER TABLE public.weather_forecast_cache
  ADD COLUMN IF NOT EXISTS humidity_avg int,
  ADD COLUMN IF NOT EXISTS humidity_max int,
  ADD COLUMN IF NOT EXISTS feels_like_high int,
  ADD COLUMN IF NOT EXISTS feels_like_low int,
  ADD COLUMN IF NOT EXISTS heat_warning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wind_max_mph int;