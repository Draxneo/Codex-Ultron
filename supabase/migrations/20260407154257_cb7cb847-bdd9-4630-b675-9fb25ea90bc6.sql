-- Attach travel cache recalculation trigger to jobs table
CREATE TRIGGER trigger_recalculate_travel_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_travel_cache();

-- Attach travel cache recalculation trigger to estimates table
CREATE TRIGGER trigger_recalculate_travel_cache_estimates
  AFTER INSERT OR UPDATE OR DELETE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_travel_cache_estimates();