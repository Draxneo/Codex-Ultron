ALTER TABLE public.repair_catalog ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.equipment_matchups ADD COLUMN IF NOT EXISTS image_url text;