
CREATE OR REPLACE FUNCTION public.sync_equipment_from_data_plate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id uuid;
  _model text;
  _serial text;
  _brand text;
BEGIN
  IF NEW.extraction_status = 'done' AND NEW.photo_type = 'data_plate'
     AND (OLD.extraction_status IS DISTINCT FROM 'done')
  THEN
    _model := NEW.extracted_model;
    _serial := NEW.extracted_serial;

    IF _model IS NULL AND _serial IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT j.customer_id INTO _customer_id
    FROM tech_forms tf
    JOIN jobs j ON j.id = tf.job_id
    WHERE tf.id = NEW.tech_form_id AND j.customer_id IS NOT NULL;

    IF _customer_id IS NULL THEN
      RETURN NEW;
    END IF;

    _brand := CASE
      WHEN _model ILIKE 'GSX%' OR _model ILIKE 'GSZ%' OR _model ILIKE 'GPC%' OR _model ILIKE 'GPG%' OR _model ILIKE 'GPD%' OR _model ILIKE 'GMV%' OR _model ILIKE 'GMS%' OR _model ILIKE 'GME%' THEN 'Goodman'
      WHEN _model ILIKE 'ASX%' OR _model ILIKE 'ASZ%' OR _model ILIKE 'AVX%' OR _model ILIKE 'APC%' THEN 'Amana'
      WHEN _model ILIKE 'DX%' OR _model ILIKE 'DZ%' OR _model ILIKE 'DM%' THEN 'Daikin'
      WHEN _model ILIKE '24A%' OR _model ILIKE '25H%' OR _model ILIKE '24V%' OR _model ILIKE 'CA%' THEN 'Carrier'
      WHEN _model ILIKE 'XR%' OR _model ILIKE 'XC%' OR _model ILIKE 'XV%' OR _model ILIKE 'XL%' THEN 'Trane'
      WHEN _model ILIKE 'RA%' OR _model ILIKE 'RH%' OR _model ILIKE 'RP%' THEN 'Rheem'
      WHEN _model ILIKE 'SX%' OR _model ILIKE 'SL%' OR _model ILIKE 'SA%' THEN 'Lennox'
      WHEN _model ILIKE '4A%' OR _model ILIKE 'T4%' THEN 'Armstrong'
      ELSE NULL
    END;

    IF _serial IS NOT NULL THEN
      INSERT INTO customer_equipment (customer_id, model_number, serial_number, brand, equipment_type)
      VALUES (_customer_id, _model, _serial, _brand, 'HVAC')
      ON CONFLICT ON CONSTRAINT customer_equipment_serial_unique
      DO UPDATE SET
        model_number = COALESCE(EXCLUDED.model_number, customer_equipment.model_number),
        brand = COALESCE(EXCLUDED.brand, customer_equipment.brand),
        updated_at = now();
    ELSE
      INSERT INTO customer_equipment (customer_id, model_number, brand, equipment_type)
      SELECT _customer_id, _model, _brand, 'HVAC'
      WHERE NOT EXISTS (
        SELECT 1 FROM customer_equipment
        WHERE customer_id = _customer_id AND model_number = _model
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE customer_equipment
ADD CONSTRAINT customer_equipment_serial_unique
UNIQUE (customer_id, serial_number);

CREATE TRIGGER trg_sync_equipment_from_data_plate
AFTER UPDATE ON tech_form_photos
FOR EACH ROW
EXECUTE FUNCTION sync_equipment_from_data_plate();
