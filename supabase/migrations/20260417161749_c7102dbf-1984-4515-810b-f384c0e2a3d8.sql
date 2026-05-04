-- Kill the 4 triggers that were calling calculate-route-cache on every job/estimate UPDATE.
-- Per business rule: only call Google Maps when a tech presses Navigate, plus once for today's ETA.
DROP TRIGGER IF EXISTS recalculate_travel_on_job_change ON public.jobs;
DROP TRIGGER IF EXISTS trigger_recalculate_travel_cache ON public.jobs;
DROP TRIGGER IF EXISTS recalculate_travel_on_estimate_change ON public.estimates;
DROP TRIGGER IF EXISTS trigger_recalculate_travel_cache_estimates ON public.estimates;