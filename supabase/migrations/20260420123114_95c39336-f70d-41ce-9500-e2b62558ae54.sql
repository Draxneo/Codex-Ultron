-- 1. Add pricing columns to repair_catalog
ALTER TABLE public.repair_catalog
  ADD COLUMN IF NOT EXISTS base_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parts_cost numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS member_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS flat_rate boolean NOT NULL DEFAULT true;

-- 2. Backfill from service_pricebook where names roughly match
UPDATE public.repair_catalog rc
SET base_price = sp.base_price,
    parts_cost = COALESCE(sp.cost, 0)
FROM public.service_pricebook sp
WHERE rc.base_price = 0
  AND (
    lower(rc.name) = lower(sp.name)
    OR lower(rc.name) LIKE '%' || lower(sp.name) || '%'
    OR lower(sp.name) LIKE '%' || lower(rc.name) || '%'
  );

-- 3. Seed defaults for remaining items based on category + labor hours
-- Labor billed at ~$165/hr blended; parts marked up
UPDATE public.repair_catalog
SET base_price = ROUND(
  CASE category
    WHEN 'Electrical' THEN 165 + (default_labor_hours * 145)
    WHEN 'Refrigerant' THEN 225 + (default_labor_hours * 165)
    WHEN 'Motors' THEN 285 + (default_labor_hours * 155)
    WHEN 'Controls' THEN 195 + (default_labor_hours * 150)
    WHEN 'Airflow' THEN 145 + (default_labor_hours * 135)
    WHEN 'Safety' THEN 165 + (default_labor_hours * 150)
    WHEN 'Drainage' THEN 125 + (default_labor_hours * 135)
    WHEN 'Upgrades' THEN 195 + (default_labor_hours * 150)
    ELSE 145 + (default_labor_hours * 145)
  END,
  -2
) + 49  -- end prices in 49/99
WHERE base_price = 0;

-- 4. Seed parts_cost roughly 30% of base_price where missing
UPDATE public.repair_catalog
SET parts_cost = ROUND(base_price * 0.30, 2)
WHERE parts_cost = 0 AND base_price > 0;

-- 5. Set member_price at 15% off base where null
UPDATE public.repair_catalog
SET member_price = ROUND(base_price * 0.85, 2)
WHERE member_price IS NULL AND base_price > 0;

-- 6. Index for filtering/sorting by price
CREATE INDEX IF NOT EXISTS idx_repair_catalog_base_price ON public.repair_catalog(base_price);
CREATE INDEX IF NOT EXISTS idx_repair_catalog_category_price ON public.repair_catalog(category, base_price);