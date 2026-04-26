UPDATE public.ahri_lookups
SET 
  outdoor_brand = REPLACE(REPLACE(REPLACE(outdoor_brand, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'),
  outdoor_series = REPLACE(REPLACE(REPLACE(outdoor_series, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'),
  outdoor_model = REPLACE(REPLACE(REPLACE(outdoor_model, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'),
  indoor_brand = REPLACE(REPLACE(REPLACE(indoor_brand, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'),
  indoor_model = REPLACE(REPLACE(REPLACE(indoor_model, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'),
  furnace_model = REPLACE(REPLACE(REPLACE(furnace_model, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')
WHERE 
  outdoor_brand LIKE '%&amp;%' OR outdoor_brand LIKE '%&#39;%' OR outdoor_brand LIKE '%&quot;%'
  OR outdoor_series LIKE '%&amp;%' OR outdoor_series LIKE '%&#39;%' OR outdoor_series LIKE '%&quot;%'
  OR outdoor_model LIKE '%&amp;%' OR outdoor_model LIKE '%&#39;%' OR outdoor_model LIKE '%&quot;%'
  OR indoor_brand LIKE '%&amp;%' OR indoor_brand LIKE '%&#39;%' OR indoor_brand LIKE '%&quot;%'
  OR indoor_model LIKE '%&amp;%' OR indoor_model LIKE '%&#39;%' OR indoor_model LIKE '%&quot;%'
  OR furnace_model LIKE '%&amp;%' OR furnace_model LIKE '%&#39;%' OR furnace_model LIKE '%&quot;%';

UPDATE public.equipment_matchups
SET brand = REPLACE(REPLACE(REPLACE(brand, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')
WHERE brand LIKE '%&amp;%' OR brand LIKE '%&#39;%' OR brand LIKE '%&quot;%';