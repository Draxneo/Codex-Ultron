
-- Drop any existing constraint that doesn't handle nulls
ALTER TABLE pricing_formulas DROP CONSTRAINT IF EXISTS pricing_formulas_brand_tier_key;

-- Create unique index that treats NULL tier as a single value
CREATE UNIQUE INDEX pricing_formulas_brand_tier_unique 
ON pricing_formulas (brand, COALESCE(tier, '__null__'));
