
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS weather_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS weather_captured_by text,
  ADD COLUMN IF NOT EXISTS weather_condition text,
  ADD COLUMN IF NOT EXISTS weather_temp_high integer,
  ADD COLUMN IF NOT EXISTS weather_temp_low integer,
  ADD COLUMN IF NOT EXISTS weather_feels_like_high integer,
  ADD COLUMN IF NOT EXISTS weather_humidity_max integer,
  ADD COLUMN IF NOT EXISTS weather_precip_chance integer,
  ADD COLUMN IF NOT EXISTS weather_wind_max_mph integer,
  ADD COLUMN IF NOT EXISTS weather_summary text,
  ADD COLUMN IF NOT EXISTS weather_source_date date;

COMMENT ON COLUMN public.jobs.weather_captured_at IS 'When the technician saved the at-job weather snapshot (e.g. for refrigerant charge documentation).';
COMMENT ON COLUMN public.jobs.weather_captured_by IS 'Name of the technician (or system) who saved the weather snapshot.';
COMMENT ON COLUMN public.jobs.weather_source_date IS 'Forecast date the snapshot was pulled from in weather_forecast_cache.';
