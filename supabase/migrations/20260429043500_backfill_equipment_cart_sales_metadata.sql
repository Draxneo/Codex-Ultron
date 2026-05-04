-- Backfill customer-safe sales metadata for equipment cart items created before
-- the richer technician picker snapshot was added.

UPDATE public.job_cart_items i
SET
  description = COALESCE(
    NULLIF(i.description, ''),
    CASE
      WHEN lower(COALESCE(m.tier, '')) LIKE '%best%' OR lower(COALESCE(m.tier, '')) LIKE '%ultimate%' THEN
        'Premium comfort system focused on quieter comfort, humidity control, efficiency, and long-term peace of mind.'
      WHEN lower(COALESCE(m.tier, '')) LIKE '%better%' OR lower(COALESCE(m.tier, '')) LIKE '%performance%' THEN
        'Balanced comfort system for stronger comfort, dependable efficiency, and a quieter home.'
      ELSE
        'Reliable comfort system replacement with clean installation, warranty protection, and improved comfort.'
    END
  ),
  image_url = COALESCE(i.image_url, m.image_url),
  metadata = COALESCE(i.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'brand', m.brand,
    'tonnage', m.tonnage,
    'system_type', m.system_type,
    'system_type_label', CASE m.system_type
      WHEN 'gas_heat' THEN 'Gas Heat'
      WHEN 'heat_pump' THEN 'Heat Pump'
      WHEN 'electric' THEN 'Straight Cool'
      WHEN 'dual_fuel' THEN 'Dual Fuel'
      ELSE COALESCE(m.system_type, 'System')
    END,
    'tier', m.tier,
    'application', m.application,
    'location_label', CASE
      WHEN lower(COALESCE(m.application, '')) LIKE '%horizontal%' THEN 'attic or horizontal installation'
      WHEN lower(COALESCE(m.application, '')) LIKE '%vertical%' THEN 'closet or vertical installation'
      WHEN lower(COALESCE(m.application, '')) LIKE '%multi%' THEN 'attic or closet installation'
      ELSE COALESCE(m.application, 'installed for your home')
    END,
    'seer2', m.seer2,
    'eer2', m.eer2,
    'hspf2', m.hspf2,
    'afue', m.afue,
    'cooling_cap', m.cooling_cap,
    'ahri_number', m.ahri_number,
    'condenser_model', m.condenser_model,
    'furnace_model', m.furnace_model,
    'coil_model', m.coil_model,
    'heat_kit', m.heat_kit,
    'model_summary', concat_ws(' + ', m.condenser_model, m.furnace_model, m.coil_model),
    'features_benefits', m.features_benefits,
    'sales_positioning', CASE
      WHEN lower(COALESCE(m.tier, '')) LIKE '%best%' OR lower(COALESCE(m.tier, '')) LIKE '%ultimate%' THEN
        jsonb_build_array(
          jsonb_build_object('title', 'Quiet confidence', 'body', 'Premium comfort profile for quieter operation and smoother temperature control.'),
          jsonb_build_object('title', 'Humidity control', 'body', 'Built to help the home feel comfortable without overcooling.'),
          jsonb_build_object('title', 'Reliability', 'body', 'Matched indoor and outdoor equipment with documented AHRI performance.'),
          jsonb_build_object('title', 'Peace of mind', 'body', 'Includes registration support, install cleanup, and warranty documentation.')
        )
      WHEN lower(COALESCE(m.tier, '')) LIKE '%better%' OR lower(COALESCE(m.tier, '')) LIKE '%performance%' THEN
        jsonb_build_array(
          jsonb_build_object('title', 'Balanced comfort', 'body', 'A strong everyday choice for comfort, efficiency, and reliability.'),
          jsonb_build_object('title', 'Reliability', 'body', 'Matched indoor and outdoor equipment with documented AHRI performance.'),
          jsonb_build_object('title', 'Peace of mind', 'body', 'Includes registration support, install cleanup, and warranty documentation.'),
          jsonb_build_object('title', 'Efficiency', 'body', concat(COALESCE(m.seer2::text, 'Modern'), ' SEER2 efficiency helps reduce wasted energy compared with older equipment.'))
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object('title', 'Comfort', 'body', 'Sized and matched to cool evenly and help the home feel less humid.'),
          jsonb_build_object('title', 'Reliability', 'body', 'Matched indoor and outdoor equipment with documented AHRI performance.'),
          jsonb_build_object('title', 'Peace of mind', 'body', 'Includes registration support, install cleanup, and warranty documentation.'),
          jsonb_build_object('title', 'Efficiency', 'body', concat(COALESCE(m.seer2::text, 'Modern'), ' SEER2 efficiency helps reduce wasted energy compared with older equipment.'))
        )
    END,
    'factory_rebate_price', m.factory_rebate_price,
    'monthly_payment', m.monthly_payment,
    'monthly_payment_120', m.monthly_payment_120,
    'cps_tonnage', m.cps_tonnage,
    'early_rebate', m.early_rebate,
    'burnout_rebate', m.burnout_rebate,
    'cps_rebate_tier', m.cps_rebate_tier
  ))
FROM public.equipment_matchups m
WHERE i.kind = 'equipment'
  AND i.source_id = m.id;
