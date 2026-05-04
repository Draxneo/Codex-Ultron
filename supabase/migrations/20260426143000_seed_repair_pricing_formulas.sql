INSERT INTO public.repair_pricing_formulas (
  category,
  flat_rate_multiplier,
  member_discount,
  margin_floor
)
VALUES
  ('default', 1.00, 0.15, 0.65),
  ('Electrical', 1.00, 0.15, 0.65),
  ('Refrigerant', 1.00, 0.15, 0.65),
  ('Airflow', 1.00, 0.15, 0.65),
  ('Motors', 1.00, 0.15, 0.65),
  ('Controls', 1.00, 0.15, 0.65),
  ('Safety', 1.00, 0.15, 0.65),
  ('Drainage', 1.00, 0.15, 0.65),
  ('Upgrades', 1.00, 0.15, 0.65),
  ('General', 1.00, 0.15, 0.65)
ON CONFLICT (category) DO NOTHING;
