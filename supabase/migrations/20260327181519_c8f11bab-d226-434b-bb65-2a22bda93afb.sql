
-- Reclassify jobs with install-indicator line items that are currently typed as 'service'
UPDATE public.jobs
SET job_type = 'install'
WHERE job_type = 'service'
  AND id IN (
    SELECT DISTINCT job_id FROM public.job_line_items
    WHERE (
      -- Brand + tonnage in name/description
      (name ~* '(goodman|carrier|trane|lennox|rheem|daikin|amana|bryant|payne|day\s*(and|&)\s*night|york|bosch|american standard|mitsubishi|fujitsu)')
      AND (name ~* '(\d+(\.\d+)?\s*[-–]?\s*ton)')
    )
    OR (
      -- Install keywords + high value
      (name ~* '(value series|comfort series|performance series|infinity series|heatpump|heat pump|changeout|change out|new system)')
      AND total_price > 3000
    )
  );
