CREATE TABLE public.ahri_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ahri_number text NOT NULL,
  program_type text,
  raw_html text,
  outdoor_brand text,
  outdoor_series text,
  outdoor_model text,
  indoor_brand text,
  indoor_model text,
  furnace_model text,
  cooling_cap_btuh numeric,
  seer2 numeric,
  eer2 numeric,
  hspf2 numeric,
  model_status text,
  refrigerant text,
  energy_star boolean DEFAULT false,
  raw_json jsonb,
  linked_matchup_id uuid REFERENCES public.equipment_matchups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ahri_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ahri_lookups" ON public.ahri_lookups FOR ALL USING (true) WITH CHECK (true);