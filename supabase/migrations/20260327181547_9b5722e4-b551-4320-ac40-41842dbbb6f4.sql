
-- Manually reclassify known install jobs that have no line items in our table yet
-- Job 7281 (Stan Tudzin) is confirmed install with Goodman 3.5 Ton Heatpump
UPDATE public.jobs SET job_type = 'install' WHERE job_number = '7281' AND job_type = 'service';
