
-- Create repair_catalog table
CREATE TABLE public.repair_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  tech_description text NOT NULL DEFAULT '',
  customer_description text NOT NULL DEFAULT '',
  importance text NOT NULL DEFAULT '',
  consequences text NOT NULL DEFAULT '',
  default_severity text NOT NULL DEFAULT 'necessary',
  default_labor_hours numeric NOT NULL DEFAULT 1,
  keywords text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.repair_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read repair_catalog" ON public.repair_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert repair_catalog" ON public.repair_catalog FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update repair_catalog" ON public.repair_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete repair_catalog" ON public.repair_catalog FOR DELETE TO authenticated USING (true);

-- Add catalog_item_id to service_repair_items
ALTER TABLE public.service_repair_items ADD COLUMN catalog_item_id uuid REFERENCES public.repair_catalog(id);

-- Seed common HVAC repairs
INSERT INTO public.repair_catalog (name, category, tech_description, customer_description, importance, consequences, default_severity, default_labor_hours, keywords) VALUES
-- Electrical
('Capacitor Replacement', 'Electrical', 'Replace failed run/start capacitor — measure µF and compare to rating', 'Repairing the component that ensures your outdoor unit starts and runs reliably', 'This component manages the electrical charge needed for your system to cycle on and run efficiently', 'System won''t start, compressor overheats, no cooling or heating', 'necessary', 1, '{capacitor,cap,µF,microfarad,start cap,run cap,bulging}'),
('Contactor Replacement', 'Electrical', 'Replace pitted/welded contactor — check coil resistance and contact surfaces', 'Restoring the electrical switch that controls power to your outdoor unit', 'This switch directs high-voltage power to your compressor and fan motor every cooling cycle', 'System runs continuously or won''t turn on, high electric bills, compressor damage', 'necessary', 1, '{contactor,pitted,welded,stuck,contacts,coil}'),
('Disconnect Replacement', 'Electrical', 'Replace corroded/damaged disconnect box or pull-out', 'Replacing the safety shut-off switch near your outdoor unit', 'This is the emergency power cutoff for your outdoor system — required by code for safe servicing', 'Safety hazard, code violation, cannot safely service equipment', 'necessary', 0.5, '{disconnect,pull-out,fuse,breaker,corroded}'),
('Hard Start Kit Install', 'Electrical', 'Install 5-2-1 or equivalent hard start kit on compressor', 'Adding a start-assist device to reduce stress on your compressor during startup', 'Reduces startup electrical draw by up to 75%, extending compressor life significantly', 'Higher startup stress, shorter compressor lifespan, potential for startup failure', 'recommended', 0.5, '{hard start,5-2-1,start assist,compressor start,startup}'),
('Surge Protector Install', 'Electrical', 'Install whole-unit surge protector on outdoor disconnect', 'Installing surge protection to guard your system against power spikes', 'Power surges from storms and grid fluctuations are the #1 cause of control board failures', 'Lightning or power surge destroys control board ($500-1500 repair), no coverage', 'deluxe', 0.5, '{surge,protector,lightning,power spike,TVS}'),

-- Refrigerant
('Refrigerant Recharge', 'Refrigerant', 'Recover, weigh, and recharge system refrigerant to nameplate specs', 'Restoring your system''s cooling capacity to manufacturer specifications', 'Proper refrigerant charge is essential for efficient cooling and preventing compressor damage', 'Poor cooling, frozen coil, high electric bills, compressor failure', 'necessary', 1.5, '{refrigerant,charge,R-410A,R-22,freon,low charge,recharge,superheat,subcooling}'),
('Leak Search & Repair', 'Refrigerant', 'Electronic leak detection, nitrogen pressure test, braze repair', 'Locating and sealing a refrigerant leak in your system', 'A leak means your system loses cooling capacity over time and runs harder to compensate', 'Continued refrigerant loss, escalating repair costs, eventual system failure', 'necessary', 2, '{leak,leak search,nitrogen,braze,solder,UV dye,electronic leak}'),
('TXV Replacement', 'Refrigerant', 'Replace thermostatic expansion valve — recover refrigerant, braze new valve', 'Replacing the precision valve that controls refrigerant flow through your indoor coil', 'This valve meters exactly the right amount of refrigerant for optimal cooling and efficiency', 'Poor cooling, frozen coil, liquid slugging to compressor, compressor damage', 'necessary', 2, '{TXV,expansion valve,metering device,thermostatic,flooding,starving}'),

-- Airflow
('Blower Motor Replacement', 'Motors', 'Replace failed blower motor — match HP, RPM, rotation, and capacitor', 'Replacing the motor that circulates conditioned air throughout your home', 'This motor drives all airflow through your duct system — without it, no air reaches your rooms', 'No airflow, no heating or cooling delivery, frozen coil', 'necessary', 1.5, '{blower,blower motor,fan motor,indoor motor,ECM,PSC,no air}'),
('Condenser Fan Motor Replacement', 'Motors', 'Replace condenser fan motor — match HP, RPM, shaft size, rotation', 'Replacing the fan motor that cools your outdoor unit', 'This motor draws air across the outdoor coil to release heat — critical for system operation', 'Compressor overheats and shuts down, no cooling, compressor damage', 'necessary', 1, '{condenser fan,outdoor fan,fan motor,overheating,not spinning}'),
('Indoor Coil Cleaning', 'Airflow', 'Chemical clean evaporator coil — apply coil cleaner, rinse, treat drain', 'Deep cleaning the indoor cooling coil to restore airflow and efficiency', 'Dirty coils reduce cooling capacity by up to 30% and force your system to work harder', 'Reduced cooling, higher bills, frozen coil, premature compressor wear', 'recommended', 1, '{evaporator,coil cleaning,dirty coil,indoor coil,frozen}'),
('Condenser Coil Cleaning', 'Airflow', 'Pressure wash condenser coil — chemical treatment and rinse', 'Deep cleaning the outdoor coil to restore heat rejection and efficiency', 'A dirty outdoor coil forces your compressor to work harder, increasing energy use and wear', 'Higher bills, reduced cooling, compressor overheating, shorter system life', 'recommended', 1, '{condenser coil,outdoor coil,dirty,clogged,pressure wash}'),

-- Controls
('Thermostat Replacement', 'Controls', 'Replace thermostat — wire matching, configure equipment type and staging', 'Upgrading your home''s temperature control center', 'Your thermostat is the brain of your comfort system — it controls when and how your system runs', 'Inaccurate temperatures, no scheduling capability, wasted energy', 'recommended', 1, '{thermostat,tstat,programmable,smart thermostat,Honeywell,Ecobee,Nest}'),
('Control Board Replacement', 'Controls', 'Replace failed control/circuit board — match part number, verify wiring', 'Replacing the main circuit board that controls your system''s operation', 'This board coordinates all electrical functions — fan speeds, safety circuits, and communication', 'System inoperable, intermittent operation, safety circuits disabled', 'necessary', 1.5, '{control board,circuit board,PCB,board,relay,fuse blown}'),
('Transformer Replacement', 'Controls', 'Replace 24V control transformer — verify VA rating and wiring', 'Replacing the component that powers your thermostat and safety controls', 'This provides low-voltage power to your thermostat and all control circuits', 'No thermostat power, system completely inoperable', 'necessary', 0.75, '{transformer,24V,low voltage,no power,VA}'),

-- Safety
('Flame Sensor Cleaning/Replacement', 'Safety', 'Clean or replace flame sensor rod — measure µA signal', 'Servicing the safety sensor that confirms your furnace burner is lit', 'This sensor verifies flame presence every cycle — your furnace cannot run without a confirmed flame signal', 'Furnace shuts off after a few seconds, repeated ignition attempts, no heat', 'necessary', 0.5, '{flame sensor,flame rod,µA,microamp,lockout,short cycling,ignition}'),
('Ignitor Replacement', 'Safety', 'Replace hot surface ignitor or spark ignitor assembly', 'Replacing the component that lights your furnace burner', 'Without a functioning ignitor, your furnace cannot light — no ignition means no heat', 'No heat, furnace won''t light, repeated lockouts', 'necessary', 0.75, '{ignitor,igniter,HSI,hot surface,spark,no ignition,glow}'),
('Pressure Switch Replacement', 'Safety', 'Replace pressure switch — verify inducer operation and flue integrity', 'Replacing the safety switch that ensures proper exhaust venting', 'This switch confirms that combustion gases are safely venting before allowing your furnace to light', 'Furnace lockout, potential carbon monoxide risk if bypassed', 'necessary', 0.75, '{pressure switch,inducer,venting,flue,lockout,hose}'),
('Safety Inspection', 'Safety', 'Comprehensive safety inspection — CO test, gas leak check, electrical inspection', 'Complete safety evaluation of your heating system', 'Ensures your system operates safely with no gas leaks, proper combustion, and correct electrical connections', 'Undetected safety hazards, carbon monoxide risk, fire risk', 'recommended', 1, '{safety,inspection,CO,carbon monoxide,gas leak,combustion}'),

-- Drainage
('Drain Line Clearing', 'Drainage', 'Clear clogged condensate drain — wet vac, flush, treat with tablets', 'Clearing and treating your system''s condensate drain to prevent water damage', 'Your AC produces gallons of water daily — a clogged drain causes overflow and water damage', 'Water damage to ceilings/floors, mold growth, system shutdown (if float switch equipped)', 'necessary', 0.5, '{drain,clogged,condensate,overflow,water,float switch,pan,drain line}'),
('Float Switch Install', 'Drainage', 'Install auxiliary condensate float switch on drain pan', 'Adding a safety switch to shut down your system before water overflow occurs', 'Acts as an emergency shutoff if your drain clogs — prevents thousands in water damage', 'No overflow protection, potential ceiling/floor water damage from drain backup', 'recommended', 0.5, '{float switch,overflow,safety switch,drain pan,water damage}'),

-- Upgrades
('UV Light Installation', 'Upgrades', 'Install UV-C germicidal light in return plenum or above coil', 'Installing an ultraviolet light system to improve your indoor air quality', 'UV light continuously neutralizes mold, bacteria, and allergens on your indoor coil and in airflow', 'Continued biological growth on coil, potential allergy and respiratory irritation', 'deluxe', 1, '{UV,ultraviolet,air quality,germicidal,mold,bacteria,IAQ}'),
('Duct Sealing', 'Upgrades', 'Seal duct joints and connections with mastic or approved sealant', 'Sealing your ductwork to eliminate air loss and improve system efficiency', 'Typical homes lose 20-30% of conditioned air through duct leaks — sealing recovers that energy', 'Wasted energy, uneven room temperatures, dusty air, higher utility bills', 'deluxe', 2, '{duct,sealing,mastic,leaking,duct tape,air loss,efficiency}'),
('Maintenance Plan Enrollment', 'Upgrades', 'Enroll customer in preventive maintenance agreement', 'Enrolling in our preventive maintenance program for priority service and savings', 'Regular maintenance extends system life by 5-10 years and catches small issues before they become expensive repairs', 'No priority scheduling, full-price repairs, shorter equipment lifespan', 'deluxe', 0, '{maintenance,plan,agreement,tune-up,preventive,membership,enrollment}');
