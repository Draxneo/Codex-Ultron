
-- Brochure content blocks: one row per brand+series combo
CREATE TABLE public.brochure_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL DEFAULT 'carrier',
  label TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  header_gradient TEXT NOT NULL DEFAULT 'from-primary via-primary to-primary',
  accent_color TEXT NOT NULL DEFAULT 'text-accent',
  accent_bg TEXT NOT NULL DEFAULT 'bg-accent/10',
  tier_color TEXT NOT NULL DEFAULT 'text-primary',
  tier_bg TEXT NOT NULL DEFAULT 'bg-primary/5',
  compressor_type TEXT NOT NULL DEFAULT 'Single-stage',
  sound_level TEXT NOT NULL DEFAULT 'Standard',
  humidity_desc TEXT NOT NULL DEFAULT 'Basic',
  expected_lifespan TEXT NOT NULL DEFAULT '12–15 years',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brochure_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view brochure blocks"
  ON public.brochure_blocks FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage brochure blocks"
  ON public.brochure_blocks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Comparison blocks
CREATE TABLE public.comparison_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '❄️',
  sort_order INTEGER NOT NULL DEFAULT 0,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comparison_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comparison blocks"
  ON public.comparison_blocks FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage comparison blocks"
  ON public.comparison_blocks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Addons table
CREATE TABLE public.addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  detail TEXT,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  promo_active BOOLEAN NOT NULL DEFAULT false,
  promo_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  brochure_url TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active addons"
  ON public.addons FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage addons"
  ON public.addons FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed brochure_blocks
INSERT INTO public.brochure_blocks (series, brand, label, tagline, sort_order, header_gradient, accent_color, accent_bg, tier_color, tier_bg, compressor_type, sound_level, humidity_desc, expected_lifespan, features) VALUES
('Goodman S4', 'goodman', 'Value', 'Dependable cooling at the best price', 0,
 'from-[#1a3a2a] via-[#224a35] to-[#2d5f44]', 'text-green-500', 'bg-green-500/10', 'text-emerald-700', 'bg-emerald-50',
 'Single-stage', 'Standard', 'Basic', '12–15 years',
 '[{"icon":"Snowflake","title":"{seer2} SEER2 Efficiency","desc":"Rated at {seer2} SEER2{eer2_suffix} — meets current federal efficiency standards and keeps your energy bills in check."},{"icon":"ShieldCheck","title":"Reliable Single-Stage Cooling","desc":"Straightforward single-stage compressor delivers consistent cooling without unnecessary complexity."},{"icon":"Wrench","title":"Easy Serviceability","desc":"Simple, proven design means faster repairs and widely available parts if anything ever needs attention."}]'::jsonb),
('Goodman S5', 'goodman', 'Value Plus', 'Better efficiency, same great value', 1,
 'from-[#1a3a2a] via-[#224a35] to-[#2d5f44]', 'text-green-500', 'bg-green-500/10', 'text-emerald-700', 'bg-emerald-50',
 'Single-stage', 'Standard', 'Basic', '12–15 years',
 '[{"icon":"Snowflake","title":"{seer2} SEER2 / {eer2} EER2","desc":"Higher efficiency rating of {seer2} SEER2 means lower monthly energy costs compared to the S4 series."},{"icon":"ShieldCheck","title":"Enhanced Build Quality","desc":"Upgraded components and improved cabinet design for better durability and weather resistance."},{"icon":"Gauge","title":"Better Performance","desc":"{eer2} EER2 rating delivers more effective cooling per watt, especially during peak afternoon heat."}]'::jsonb),
('Payne', 'payne', 'Economy', 'Proven comfort at a smart price', 2,
 'from-[#1a1a2e] via-[#2a2a4e] to-[#3a3a6e]', 'text-blue-400', 'bg-blue-400/10', 'text-blue-700', 'bg-blue-50',
 'Single-stage', '72–76 dB', 'Basic', '12–15 years',
 '[{"icon":"Snowflake","title":"{seer2} SEER2 Rated","desc":"Tested and certified at {seer2} SEER2{eer2_suffix}. A step above builder-grade efficiency."},{"icon":"ShieldCheck","title":"Carrier-Engineered Quality","desc":"Built by the same company that makes Carrier — same factory standards, same engineering DNA, at a more accessible price."},{"icon":"Volume2","title":"Quiet Outdoor Unit","desc":"Sound-dampening features and quality compressor keep noise levels comfortable for you and your neighbors."}]'::jsonb),
('Comfort', 'carrier', 'Good', 'Reliable Carrier comfort for your family', 3,
 'from-primary via-primary to-[hsl(var(--navy-light))]', 'text-accent', 'bg-accent/10', 'text-primary', 'bg-primary/5',
 'Single-stage', '72–76 dB', 'Standard', '15–18 years',
 '[{"icon":"Snowflake","title":"{seer2} SEER2 Efficiency","desc":"Certified at {seer2} SEER2{eer2_suffix} — a meaningful upgrade over minimum-efficiency systems that translates to lower monthly bills."},{"icon":"ShieldCheck","title":"Carrier Quality Construction","desc":"Galvanized steel cabinet with baked-on powder paint, WeatherArmor Ultra™ protection, and a 10-year parts warranty."},{"icon":"Volume2","title":"Quiet Operation","desc":"Aerodynamic top discharge design and isolated compressor mounts reduce vibration and operating noise."},{"icon":"Leaf","title":"Puron® Refrigerant","desc":"Uses environmentally friendlier Puron® (R-410A) refrigerant — no ozone-depleting chemicals."}]'::jsonb),
('Performance', 'carrier', 'Better', 'Two-stage comfort, noticeably quieter', 4,
 'from-primary via-primary to-[hsl(var(--navy-light))]', 'text-accent', 'bg-accent/10', 'text-accent', 'bg-accent/10',
 'Two-stage', '68–72 dB', 'Enhanced — 2× removal', '15–18 years',
 '[{"icon":"Settings","title":"Two-Stage at {seer2} SEER2","desc":"Two-stage compressor runs at 65% capacity most of the time, stepping up to 100% only on the hottest days. Rated {seer2} SEER2{eer2_suffix}."},{"icon":"Volume2","title":"Significantly Quieter","desc":"Compressor sound blanket + two-stage operation = noticeably less noise than single-stage systems."},{"icon":"Droplets","title":"Better Humidity Control","desc":"Longer run cycles at lower capacity pull 2× more moisture from your air. No more clammy, uncomfortable rooms."},{"icon":"Zap","title":"{eer2} EER2 Peak Efficiency","desc":"{eer2} EER2 means more cooling per watt during the hottest part of the day."},{"icon":"Award","title":"InteliSense™ Diagnostics","desc":"Smart diagnostics share performance data with your dealer for faster, more efficient service."}]'::jsonb),
('Infinity', 'carrier', 'Best', 'Variable-speed precision, total control', 5,
 'from-primary via-primary to-[hsl(var(--navy-light))]', 'text-accent', 'bg-accent/10', 'text-primary', 'bg-primary/10',
 'Variable-speed', 'As low as 51 dB', 'Ideal Humidity™ — 4× removal', '18–22 years',
 '[{"icon":"Wind","title":"Variable-Speed at {seer2} SEER2","desc":"Inverter-driven variable-speed compressor adjusts in 1% increments from 25–100% capacity. Rated {seer2} SEER2{eer2_suffix} — among the highest in the industry."},{"icon":"Volume2","title":"Whisper-Quiet (as low as 51 dBA)","desc":"Silencer System II™ technology makes this one of the quietest units available."},{"icon":"Droplets","title":"400% More Humidity Removal","desc":"Ideal Humidity System™ removes up to 4× more moisture than single-stage systems."},{"icon":"Wifi","title":"Infinity® Smart Thermostat","desc":"Wi-Fi control with energy tracking, phone alerts, and remote dealer diagnostics — included."},{"icon":"BarChart3","title":"Remote Monitoring","desc":"Your dealer can monitor system performance remotely and alert you before small issues become expensive problems."}]'::jsonb),
('Greenspeed', 'carrier', 'Ultimate', 'The pinnacle of home comfort technology', 6,
 'from-primary via-primary to-[hsl(var(--navy-light))]', 'text-accent', 'bg-accent/10', 'text-[hsl(var(--brochure-emerald))]', 'bg-[hsl(var(--brochure-emerald-light))]',
 'Variable-speed inverter', 'Near-silent', 'Ultimate — 4× removal', '18–22 years',
 '[{"icon":"Wind","title":"Greenspeed® at {seer2} SEER2","desc":"Greenspeed® Intelligence with inverter-driven variable-speed delivers {seer2} SEER2{eer2_suffix} — the most precise comfort technology available."},{"icon":"Volume2","title":"Near-Silent Operation","desc":"Variable-speed means no jarring starts. The system ramps gently and runs continuously at exactly the output needed."},{"icon":"Droplets","title":"Ultimate Humidity Control","desc":"Running low and slow removes up to 400% more humidity than single-stage."},{"icon":"Wifi","title":"Infinity® Smart Thermostat Included","desc":"Full smart-home integration with energy tracking, remote diagnostics, and dealer monitoring built in."},{"icon":"Award","title":"Premium Warranty & Diagnostics","desc":"Enhanced warranty coverage plus proactive remote monitoring means peace of mind for years to come."}]'::jsonb);

-- Seed comparison_blocks
INSERT INTO public.comparison_blocks (category, icon, sort_order, rows) VALUES
('Cooling Performance', '❄️', 0, '[{"label":"Efficiency","good":"14 SEER","better":"17 SEER","best":"19+ SEER"},{"label":"Compressor type","good":"Single-stage","better":"Two-stage","best":"Variable speed"},{"label":"Capacity range","good":"100% on or off","better":"65% / 100%","best":"25–100% continuous"},{"label":"Temperature consistency","good":"±3-4°F swings","better":"±2°F","best":"±0.5-1°F"},{"label":"Hot/cold spots","good":"Common","better":"Reduced","best":"Minimal"}]'),
('Comfort & Humidity', '💧', 1, '[{"label":"Dehumidification","good":"Basic","better":"Better","best":"Excellent"},{"label":"Humidity removal","good":"Only when running","better":"Longer cycles help","best":"Runs low & slow, removes 2x more"},{"label":"Clammy feeling","good":"Sometimes","better":"Rarely","best":"Never"},{"label":"Recommended for","good":"Dry climates","better":"Most homes","best":"Humid climates, tight houses"}]'),
('Sound Levels', '🔇', 2, '[{"label":"Outdoor unit","good":"72-76 dB","better":"68-72 dB","best":"56-65 dB"},{"label":"Comparison","good":"Vacuum cleaner","better":"Normal conversation","best":"Quiet library"},{"label":"Indoor blower","good":"Noticeable","better":"Softer","best":"Near-silent"},{"label":"Startup sound","good":"Hard start","better":"Softer ramp","best":"Smooth ramp, no jolt"}]'),
('Airflow & Fan', '🌀', 3, '[{"label":"Fan speeds","good":"1 speed","better":"2-3 speeds","best":"Variable (unlimited)"},{"label":"Airflow feel","good":"Blast on/off","better":"More even","best":"Gentle, continuous"},{"label":"Short cycling","good":"Common","better":"Reduced","best":"Rare"},{"label":"Run time","good":"Short bursts","better":"Longer cycles","best":"Long, efficient cycles"}]'),
('Air Quality', '🌿', 4, '[{"label":"Filtration compatibility","good":"Standard 1\" filter","better":"Standard 1\" filter","best":"High-capacity 4\"+ media filter"},{"label":"Air circulation","good":"Intermittent","better":"Better","best":"Continuous option"},{"label":"Dust/allergen control","good":"Basic","better":"Good","best":"Excellent"},{"label":"UV / purifier ready","good":"Add-on","better":"Add-on","best":"Integrated options"}]'),
('Reliability & Warranty', '🛡️', 5, '[{"label":"Compressor stress","good":"High (on/off cycling)","better":"Medium","best":"Low (soft start, variable)"},{"label":"Expected lifespan","good":"12-15 years","better":"15-18 years","best":"18-22 years"},{"label":"Parts warranty","good":"10 years","better":"10 years","best":"10 years"},{"label":"Labor warranty","good":"1 year","better":"1 year","best":"Extended available"},{"label":"Smart diagnostics","good":"❌","better":"❌","best":"✅ Alerts before failure"}]'),
('Smart Features', '📱', 6, '[{"label":"Wi-Fi thermostat","good":"Compatible","better":"Compatible","best":"Included (Infinity)"},{"label":"Phone alerts","good":"❌","better":"❌","best":"✅"},{"label":"Dealer diagnostics","good":"Manual","better":"Manual","best":"Remote monitoring"},{"label":"Energy tracking","good":"❌","better":"❌","best":"✅"}]');

-- Seed addons
INSERT INTO public.addons (name, description, detail, cost, sort_order) VALUES
('UV Air Purifier', 'Kills mold, bacteria & viruses in your ductwork and in the air', 'REME HALO-LED® — whole-home air purification that installs in your ductwork. Uses UV-C light and ionization to neutralize viruses, bacteria, mold, and odors throughout every room. No filters to replace — just cleaner air 24/7.', 495, 0),
('Smart Thermostat Upgrade', 'Wi-Fi thermostat with phone control & scheduling', 'Carrier Smart Thermostat S6 — designed specifically for Carrier systems.', 350, 1);
