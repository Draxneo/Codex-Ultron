ALTER TABLE public.ivr_menu_options ADD COLUMN IF NOT EXISTS dept_sat_hours_start text DEFAULT NULL;
ALTER TABLE public.ivr_menu_options ADD COLUMN IF NOT EXISTS dept_sat_hours_end text DEFAULT NULL;