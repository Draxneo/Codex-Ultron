
-- 1. Mirror weather columns on estimates
ALTER TABLE public.estimates
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

-- 2. Helper: snapshot today's forecast into all jobs/estimates scheduled today.
--    Only fills rows that have NOT been manually captured yet.
CREATE OR REPLACE FUNCTION public.snapshot_daily_weather_to_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'America/Chicago')::date;
  _wx record;
  _jobs_updated int := 0;
  _est_updated int := 0;
BEGIN
  SELECT * INTO _wx
  FROM public.weather_forecast_cache
  WHERE forecast_date = _today
  LIMIT 1;

  IF _wx IS NULL THEN
    RETURN jsonb_build_object('status','no_forecast','date',_today);
  END IF;

  UPDATE public.jobs
  SET weather_captured_at = now(),
      weather_captured_by = 'auto',
      weather_condition = _wx.condition,
      weather_temp_high = _wx.temp_high,
      weather_temp_low = _wx.temp_low,
      weather_feels_like_high = _wx.feels_like_high,
      weather_humidity_max = _wx.humidity_max,
      weather_precip_chance = _wx.precip_chance,
      weather_wind_max_mph = _wx.wind_max_mph,
      weather_summary = _wx.summary,
      weather_source_date = _wx.forecast_date
  WHERE scheduled_date = _today
    AND weather_captured_at IS NULL
    AND COALESCE(status,'') NOT IN ('canceled');
  GET DIAGNOSTICS _jobs_updated = ROW_COUNT;

  UPDATE public.estimates
  SET weather_captured_at = now(),
      weather_captured_by = 'auto',
      weather_condition = _wx.condition,
      weather_temp_high = _wx.temp_high,
      weather_temp_low = _wx.temp_low,
      weather_feels_like_high = _wx.feels_like_high,
      weather_humidity_max = _wx.humidity_max,
      weather_precip_chance = _wx.precip_chance,
      weather_wind_max_mph = _wx.wind_max_mph,
      weather_summary = _wx.summary,
      weather_source_date = _wx.forecast_date
  WHERE scheduled_date = _today
    AND weather_captured_at IS NULL
    AND COALESCE(status,'') NOT IN ('canceled','lost');
  GET DIAGNOSTICS _est_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'status','ok',
    'date',_today,
    'jobs_updated',_jobs_updated,
    'estimates_updated',_est_updated,
    'condition',_wx.condition,
    'temp_high',_wx.temp_high
  );
END;
$$;

-- 3. Schedule daily at 6:05 AM Central (11:05 UTC during CST, 10:05 UTC during CDT — close enough)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snapshot-daily-weather-to-jobs') THEN
    PERFORM cron.unschedule('snapshot-daily-weather-to-jobs');
  END IF;
  PERFORM cron.schedule(
    'snapshot-daily-weather-to-jobs',
    '5 11 * * *',
    $cron$ SELECT public.snapshot_daily_weather_to_jobs(); $cron$
  );
END $$;
