-- Move Day and Night heat pump air handler models from furnace_model to coil_model
UPDATE public.equipment_matchups
SET coil_model = furnace_model,
    furnace_model = NULL
WHERE brand = 'Day and Night'
  AND system_type = 'heat_pump'
  AND coil_model IS NULL
  AND furnace_model IS NOT NULL;