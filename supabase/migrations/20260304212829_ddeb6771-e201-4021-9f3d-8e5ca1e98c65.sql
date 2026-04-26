
ALTER TABLE tech_form_fields ADD COLUMN condition text DEFAULT NULL;
ALTER TABLE tech_form_photos ADD COLUMN extracted_items jsonb DEFAULT NULL;
ALTER TABLE tech_form_photos ADD COLUMN extracted_total numeric DEFAULT NULL;
ALTER TABLE tech_form_photos ADD COLUMN extracted_supply_house text DEFAULT NULL;
