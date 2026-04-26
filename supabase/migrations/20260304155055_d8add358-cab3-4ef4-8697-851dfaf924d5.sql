
-- Rename existing columns
ALTER TABLE public.equipment_matchups RENAME COLUMN outdoor_model TO condenser_model;
ALTER TABLE public.equipment_matchups RENAME COLUMN indoor_model TO furnace_model;
ALTER TABLE public.equipment_matchups RENAME COLUMN seer TO seer2;

-- Drop unused description columns
ALTER TABLE public.equipment_matchups DROP COLUMN IF EXISTS outdoor_description;
ALTER TABLE public.equipment_matchups DROP COLUMN IF EXISTS indoor_description;

-- Add new columns
ALTER TABLE public.equipment_matchups ADD COLUMN coil_model text;
ALTER TABLE public.equipment_matchups ADD COLUMN eer2 numeric;
ALTER TABLE public.equipment_matchups ADD COLUMN hspf2 numeric;
ALTER TABLE public.equipment_matchups ADD COLUMN cooling_cap numeric;
ALTER TABLE public.equipment_matchups ADD COLUMN component_price numeric;
ALTER TABLE public.equipment_matchups ADD COLUMN total_price numeric;
ALTER TABLE public.equipment_matchups ADD COLUMN system_type text DEFAULT 'gas_heat';
