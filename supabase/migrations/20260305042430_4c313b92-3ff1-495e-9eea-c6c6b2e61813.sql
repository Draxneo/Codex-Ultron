ALTER TABLE public.supply_house_locations
  ADD COLUMN account_number text DEFAULT NULL,
  ADD COLUMN rep_name text DEFAULT NULL,
  ADD COLUMN rep_phone text DEFAULT NULL;