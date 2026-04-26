
CREATE TABLE public.equipment_matchups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL,
  outdoor_model text NOT NULL,
  outdoor_description text,
  indoor_model text,
  indoor_description text,
  tonnage numeric,
  seer numeric,
  afue numeric,
  ahri_number text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_matchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to equipment_matchups" ON public.equipment_matchups
  FOR ALL USING (true) WITH CHECK (true);
