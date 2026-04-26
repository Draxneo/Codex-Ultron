-- Recompute lovable_ai using stored tokens_used (assume 70/30 input/output split, gemini-flash rate as default)
UPDATE api_usage_log
SET estimated_cost_cents = ROUND(
  (
    (COALESCE(tokens_used, 0) * 0.7 * 0.30 / 1000000.0) +
    (COALESCE(tokens_used, 0) * 0.3 * 2.50 / 1000000.0)
  ) * 100 * 10000
) / 10000.0
WHERE service = 'lovable_ai'
  AND tokens_used IS NOT NULL
  AND tokens_used > 0;

-- Lovable AI rows with no token data: estimate as 0 (can't reconstruct)
UPDATE api_usage_log
SET estimated_cost_cents = 0
WHERE service = 'lovable_ai'
  AND (tokens_used IS NULL OR tokens_used = 0);

-- Google Maps: flat 0.5¢ per call (Geocoding/Directions list price ~$5/1000)
UPDATE api_usage_log
SET estimated_cost_cents = 0.5
WHERE service = 'google_maps';

-- Deepgram: ~0.0072¢/sec, default to 0.05¢ when no duration metadata
UPDATE api_usage_log
SET estimated_cost_cents = 0.05
WHERE service = 'deepgram';
