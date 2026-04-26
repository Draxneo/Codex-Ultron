-- Add website_url column to supply_houses for vendor management
ALTER TABLE public.supply_houses ADD COLUMN IF NOT EXISTS website_url text;
