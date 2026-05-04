import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



// CPS BTUh-to-Tons lookup
function cpsBtuhToTons(btuh: number): number {
  if (btuh < 18000) return 1.0;
  if (btuh < 21000) return 1.5;
  if (btuh < 27000) return 2.0;
  if (btuh < 33000) return 2.5;
  if (btuh < 39000) return 3.0;
  if (btuh < 45000) return 3.5;
  if (btuh < 54000) return 4.0;
  return 5.0;
}

const CPS_TIERS = [
  { min: 13.8, max: 15.1, earlyPer: 115, burnoutPer: 90 },
  { min: 15.2, max: 16.1, earlyPer: 130, burnoutPer: 120 },
  { min: 16.2, max: 17.0, earlyPer: 175, burnoutPer: 150 },
  { min: 17.1, max: 19.9, earlyPer: 250, burnoutPer: 225 },
  { min: 20.0, max: 99, earlyPer: 310, burnoutPer: 275 },
];

function calculateCpsRebates(cooling_cap: number | null, seer2: number | null) {
  if (cooling_cap == null || seer2 == null) return { cps_tonnage: null, early_rebate: null, burnout_rebate: null };
  const tons = cpsBtuhToTons(cooling_cap);
  const tier = CPS_TIERS.find(t => seer2 >= t.min && seer2 <= t.max);
  if (!tier) return { cps_tonnage: tons, early_rebate: null, burnout_rebate: null };
  return { cps_tonnage: tons, early_rebate: tons * tier.earlyPer, burnout_rebate: tons * tier.burnoutPer };
}

interface Matchup {
  brand: string;
  system_type: string;
  tier: string;
  application: string;
  condenser_model: string;
  furnace_model: string | null;
  coil_model: string | null;
  heat_kit: string | null;
  tonnage: number;
  seer2: number | null;
  eer2: number | null;
  hspf2: number | null;
  cooling_cap: number | null;
  afue: number | null;
  ahri_number: string | null;
  total_price: number | null;
  component_price: number | null;
  notes: string | null;
}

// ──────────────────────────────────────────────
// GAS HEAT (80% Furnace) matchups
// ──────────────────────────────────────────────
const gasHeat: Matchup[] = [
  // 1.5T
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F18P", furnace_model:"A80UH1E045A12", coil_model:"7EH30AX", heat_kit:null,
    tonnage:1.5, seer2:16.80, eer2:14.20, hspf2:null, cooling_cap:18000, afue:80,
    ahri_number:"215591906", total_price:2544, component_price:2469, notes:"CT motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Vertical",
    condenser_model:"A7AC14F18P", furnace_model:"A80UH1E045A12", coil_model:"7EC30AX", heat_kit:null,
    tonnage:1.5, seer2:16.50, eer2:14.00, hspf2:null, cooling_cap:18000, afue:80,
    ahri_number:"215591822", total_price:2474, component_price:2399, notes:"CT motor" },

  // 2.5T
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F30P", furnace_model:"A80UH1E045A12", coil_model:"7EH36AX", heat_kit:null,
    tonnage:2.5, seer2:15.50, eer2:13.00, hspf2:null, cooling_cap:30000, afue:80,
    ahri_number:"215592617", total_price:2723, component_price:2648, notes:"CT motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F30P", furnace_model:"A80US2V070A12", coil_model:"7EH36AX", heat_kit:null,
    tonnage:2.5, seer2:15.20, eer2:12.80, hspf2:null, cooling_cap:30000, afue:80,
    ahri_number:"215592620", total_price:3120, component_price:3045, notes:"VS motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Vertical",
    condenser_model:"A7AC14F30P", furnace_model:"A80UH1E045A12", coil_model:"7EC36AX", heat_kit:null,
    tonnage:2.5, seer2:16.00, eer2:13.40, hspf2:null, cooling_cap:30000, afue:80,
    ahri_number:"215592445", total_price:2674, component_price:2599, notes:"CT motor" },

  // 3.0T
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F36P", furnace_model:"A80UH1E045A12", coil_model:"7EH30AX", heat_kit:null,
    tonnage:3.0, seer2:15.20, eer2:13.20, hspf2:null, cooling_cap:36000, afue:80,
    ahri_number:"215593055", total_price:2871, component_price:2796, notes:"CT motor, 45k furnace" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F36P", furnace_model:"A80UH1E090B16", coil_model:"7EH36BX", heat_kit:null,
    tonnage:3.0, seer2:15.20, eer2:13.20, hspf2:null, cooling_cap:36000, afue:80,
    ahri_number:"215593108", total_price:2994, component_price:2919, notes:"CT motor, 90k furnace" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Better", application:"Horizontal",
    condenser_model:"A7HP19V36P", furnace_model:"A80US2V070A12", coil_model:"7EH36AX", heat_kit:null,
    tonnage:3.0, seer2:18.00, eer2:10.50, hspf2:null, cooling_cap:36000, afue:80,
    ahri_number:"217501425", total_price:4396, component_price:4207, notes:"19 series inverter, VS motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Best", application:"Horizontal",
    condenser_model:"A7AC22V36P", furnace_model:"A80US2V070A12", coil_model:"7EH36AX", heat_kit:null,
    tonnage:3.0, seer2:21.00, eer2:13.80, hspf2:null, cooling_cap:36000, afue:80,
    ahri_number:"215892301", total_price:5022, component_price:4369, notes:"22 series inverter, VS motor, includes ComfortSync" },

  // 3.5T
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F42P", furnace_model:"A80UH1E090B16", coil_model:"7EH48BX", heat_kit:null,
    tonnage:3.5, seer2:15.50, eer2:13.00, hspf2:null, cooling_cap:42000, afue:80,
    ahri_number:"215594055", total_price:3284, component_price:3209, notes:"CT motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Vertical",
    condenser_model:"A7AC14F42P", furnace_model:"A80UH1E090B16", coil_model:"7EC48BX", heat_kit:null,
    tonnage:3.5, seer2:15.50, eer2:13.00, hspf2:null, cooling_cap:42000, afue:80,
    ahri_number:"215593797", total_price:3230, component_price:3155, notes:"CT motor" },

  // 4.0T
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F48P", furnace_model:"A80UH1E090B16", coil_model:"7EH48BX", heat_kit:null,
    tonnage:4.0, seer2:14.30, eer2:12.20, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"215594614", total_price:3446, component_price:3371, notes:"CT motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F48P", furnace_model:"A80US2V090B16", coil_model:"7EH48BX", heat_kit:null,
    tonnage:4.0, seer2:14.70, eer2:12.80, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"215594654", total_price:3824, component_price:3749, notes:"VS motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Better", application:"Horizontal",
    condenser_model:"A7HP19V60P", furnace_model:"A80US2V090C20", coil_model:"7EH51CX", heat_kit:null,
    tonnage:4.0, seer2:18.00, eer2:10.00, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"217465320", total_price:5288, component_price:5213, notes:"19 series inverter, VS motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Best", application:"Horizontal",
    condenser_model:"A7AC22V48P", furnace_model:"A80US2V090B16", coil_model:"7EH48BX", heat_kit:null,
    tonnage:4.0, seer2:20.00, eer2:13.80, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"215892657", total_price:5652, component_price:5002, notes:"22 series inverter, VS motor, includes ComfortSync" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Vertical",
    condenser_model:"A7AC14F48P", furnace_model:"A80UH1E090B16", coil_model:"7EC48BX", heat_kit:null,
    tonnage:4.0, seer2:14.70, eer2:12.40, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"215594441", total_price:3392, component_price:3317, notes:"CT motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Vertical",
    condenser_model:"A7AC14F48P", furnace_model:"A80UH1E090C20", coil_model:"7EC60CX", heat_kit:null,
    tonnage:4.0, seer2:15.80, eer2:13.00, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"209151238", total_price:3538, component_price:3463, notes:"CT motor, C20 furnace" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Better", application:"Vertical",
    condenser_model:"A7HP19V60P", furnace_model:"A80US2V090B16", coil_model:"7EC48BX", heat_kit:null,
    tonnage:4.0, seer2:18.00, eer2:11.20, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"217202975", total_price:5158, component_price:5083, notes:"19 series inverter, VS motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Best", application:"Vertical",
    condenser_model:"A7AC22V48P", furnace_model:"A80US2V090B16", coil_model:"7EC48BX", heat_kit:null,
    tonnage:4.0, seer2:20.00, eer2:12.40, hspf2:null, cooling_cap:48000, afue:80,
    ahri_number:"215892565", total_price:5598, component_price:4948, notes:"22 series inverter, VS motor, includes ComfortSync" },

  // 5.0T
  { brand:"Armstrong", system_type:"gas_heat", tier:"Good", application:"Horizontal",
    condenser_model:"A7AC14F60P", furnace_model:"A80UH1E090C20", coil_model:"7EH51CX", heat_kit:null,
    tonnage:5.0, seer2:13.80, eer2:12.20, hspf2:null, cooling_cap:60000, afue:80,
    ahri_number:"215594871", total_price:3778, component_price:3703, notes:"CT motor" },
  { brand:"Armstrong", system_type:"gas_heat", tier:"Best", application:"Horizontal",
    condenser_model:"A7AC22V60P", furnace_model:"A80US2V090C20", coil_model:"7EH51CX", heat_kit:null,
    tonnage:5.0, seer2:18.00, eer2:10.00, hspf2:null, cooling_cap:60000, afue:80,
    ahri_number:"215892844", total_price:6193, component_price:5543, notes:"22 series inverter, VS motor, includes ComfortSync" },
];

// ──────────────────────────────────────────────
// ELECTRIC HEAT matchups
// ──────────────────────────────────────────────
const electric: Matchup[] = [
  // 1.5T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F18P", furnace_model:null, coil_model:"7AH1AE24PX", heat_kit:"ECB45-7.5",
    tonnage:1.5, seer2:16.50, eer2:13.80, hspf2:null, cooling_cap:18000, afue:null,
    ahri_number:"215591960", total_price:2277, component_price:2277, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F18P", furnace_model:null, coil_model:"7AH1AV24PX", heat_kit:"ECB45-7.5",
    tonnage:1.5, seer2:16.50, eer2:13.80, hspf2:null, cooling_cap:18000, afue:null,
    ahri_number:"215591966", total_price:2483, component_price:2483, notes:"VS air handler" },

  // 2.0T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F24P", furnace_model:null, coil_model:"7AH1AE24PX", heat_kit:"ECB45-7.5",
    tonnage:2.0, seer2:16.00, eer2:13.40, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:"215591972", total_price:2378, component_price:2378, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F24P", furnace_model:null, coil_model:"7AH1AV24PX", heat_kit:"ECB45-7.5",
    tonnage:2.0, seer2:16.00, eer2:13.40, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:"215591977", total_price:2584, component_price:2584, notes:"VS air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Best", application:"Multiposition",
    condenser_model:"A7AC22V24P", furnace_model:null, coil_model:"7AH2AV24PXC", heat_kit:"ECB48-9CB-P",
    tonnage:2.0, seer2:21.50, eer2:14.00, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:"215887288", total_price:4358, component_price:3803, notes:"22 series inverter, includes ComfortSync" },
  { brand:"Armstrong", system_type:"electric", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V36P", furnace_model:null, coil_model:"7AH1AV24PX", heat_kit:"ECB45-7.5",
    tonnage:2.0, seer2:19.00, eer2:12.80, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:"217202736", total_price:3862, component_price:3862, notes:"19 series inverter" },

  // 2.5T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F30P", furnace_model:null, coil_model:"7AH1AE30PX", heat_kit:"ECB45-10CB-P",
    tonnage:2.5, seer2:16.00, eer2:13.40, hspf2:null, cooling_cap:30000, afue:null,
    ahri_number:"215592320", total_price:2580, component_price:2580, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F30P", furnace_model:null, coil_model:"7AH1AV36PX", heat_kit:"ECB45-10CB-P",
    tonnage:2.5, seer2:16.00, eer2:13.40, hspf2:null, cooling_cap:30000, afue:null,
    ahri_number:"215592327", total_price:2769, component_price:2769, notes:"VS air handler" },

  // 3.0T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F36P", furnace_model:null, coil_model:"7AH1AE36PX", heat_kit:"ECB45-10CB-P",
    tonnage:3.0, seer2:16.00, eer2:13.60, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"215592743", total_price:2734, component_price:2734, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F36P", furnace_model:null, coil_model:"7AH1AV36PX", heat_kit:"ECB45-10CB-P",
    tonnage:3.0, seer2:15.50, eer2:13.60, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"215592749", total_price:2906, component_price:2906, notes:"VS air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Best", application:"Multiposition",
    condenser_model:"A7AC22V36P", furnace_model:null, coil_model:"7AH2AV36PXC", heat_kit:"ECB48-9CB-P",
    tonnage:3.0, seer2:22.00, eer2:12.50, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"215887289", total_price:4812, component_price:4257, notes:"22 series inverter, includes ComfortSync" },
  { brand:"Armstrong", system_type:"electric", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V36P", furnace_model:null, coil_model:"7AH1AV36PX", heat_kit:"ECB45-10CB-P",
    tonnage:3.0, seer2:17.00, eer2:10.50, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"217202749", total_price:3931, component_price:3931, notes:"19 series inverter" },

  // 3.5T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F42P", furnace_model:null, coil_model:"7AH1AE48PX", heat_kit:"ECB45-15CB-P",
    tonnage:3.5, seer2:15.50, eer2:13.00, hspf2:null, cooling_cap:42000, afue:null,
    ahri_number:"215593732", total_price:3125, component_price:3125, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F42P", furnace_model:null, coil_model:"7AH1AV36PX", heat_kit:"ECB45-15CB-P",
    tonnage:3.5, seer2:15.20, eer2:12.80, hspf2:null, cooling_cap:42000, afue:null,
    ahri_number:"215593735", total_price:3134, component_price:3134, notes:"VS air handler" },

  // 4.0T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F48P", furnace_model:null, coil_model:"7AH1AE48PX", heat_kit:"ECB45-15CB-P",
    tonnage:4.0, seer2:14.70, eer2:12.40, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"215594419", total_price:3287, component_price:3287, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F48P", furnace_model:null, coil_model:"7AH1AV60PX", heat_kit:"ECB45-15CB-P",
    tonnage:4.0, seer2:14.30, eer2:12.30, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"215594424", total_price:3470, component_price:3470, notes:"VS air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Best", application:"Multiposition",
    condenser_model:"A7AC22V48P", furnace_model:null, coil_model:"7AH2AV48PXC", heat_kit:"ECB48-15CB-P",
    tonnage:4.0, seer2:20.50, eer2:12.50, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"215887290", total_price:5400, component_price:4845, notes:"22 series inverter, includes ComfortSync" },
  { brand:"Armstrong", system_type:"electric", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V60P", furnace_model:null, coil_model:"7AH1AV48PX", heat_kit:"ECB45-15CB-P",
    tonnage:4.0, seer2:18.50, eer2:11.50, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"217203026", total_price:4838, component_price:4838, notes:"19 series inverter" },

  // 5.0T
  { brand:"Armstrong", system_type:"electric", tier:"Good", application:"Multiposition",
    condenser_model:"A7AC14F60P", furnace_model:null, coil_model:"7AH1AE60PX", heat_kit:"ECB45-15CB-P",
    tonnage:5.0, seer2:13.80, eer2:12.00, hspf2:null, cooling_cap:60000, afue:null,
    ahri_number:"215594811", total_price:3584, component_price:3584, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"electric", tier:"Best", application:"Multiposition",
    condenser_model:"A7AC22V60P", furnace_model:null, coil_model:"7AH2AV60PXC", heat_kit:"ECB48-15CB-P",
    tonnage:5.0, seer2:20.50, eer2:11.70, hspf2:null, cooling_cap:60000, afue:null,
    ahri_number:"215887291", total_price:5920, component_price:5365, notes:"22 series inverter, includes ComfortSync" },
];

// ──────────────────────────────────────────────
// HEAT PUMP matchups
// ──────────────────────────────────────────────
const heatPump: Matchup[] = [
  // 1.5T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F18P", furnace_model:null, coil_model:"7AH1AE24PX", heat_kit:"ECB45-7.5",
    tonnage:1.5, seer2:16.00, eer2:13.80, hspf2:null, cooling_cap:18000, afue:null,
    ahri_number:"215708747", total_price:2710, component_price:2710, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F18P", furnace_model:null, coil_model:"7AH1AV24PX", heat_kit:"ECB45-7.5",
    tonnage:1.5, seer2:16.00, eer2:13.80, hspf2:null, cooling_cap:18000, afue:null,
    ahri_number:"215708748", total_price:3048, component_price:3048, notes:"VS air handler" },

  // 2.0T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F24P", furnace_model:null, coil_model:"7AH1AE30PX", heat_kit:"ECB45-7.5",
    tonnage:2.0, seer2:16.00, eer2:13.80, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:"215711072", total_price:2864, component_price:2864, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F24P", furnace_model:null, coil_model:"7AH1AV24PX", heat_kit:"ECB45-7.5",
    tonnage:2.0, seer2:16.00, eer2:13.80, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:null, total_price:2991, component_price:2991, notes:"VS air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V36P", furnace_model:null, coil_model:"7AH1AV24PX", heat_kit:"ECB45-7.5",
    tonnage:2.0, seer2:null, eer2:null, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:null, total_price:4146, component_price:4146, notes:"19 series inverter" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Best", application:"Multiposition",
    condenser_model:"A7CP21V24P", furnace_model:null, coil_model:"7AH2AV24PXC", heat_kit:"ECB48-9CB-P",
    tonnage:2.0, seer2:20.50, eer2:13.00, hspf2:null, cooling_cap:24000, afue:null,
    ahri_number:"217120427", total_price:6205, component_price:5650, notes:"Communicating inverter, includes ComfortSync" },

  // 2.5T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F30P", furnace_model:null, coil_model:"7AH1AE30PX", heat_kit:"ECB45-10CB-P",
    tonnage:2.5, seer2:15.50, eer2:12.80, hspf2:null, cooling_cap:30000, afue:null,
    ahri_number:"215720010", total_price:3046, component_price:3046, notes:"CT air handler" },

  // 3.0T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F36P", furnace_model:null, coil_model:"7AH1AE36PX", heat_kit:"ECB45-10CB-P",
    tonnage:3.0, seer2:15.80, eer2:12.50, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"215736126", total_price:3204, component_price:3204, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F36P", furnace_model:null, coil_model:"7AH1AV36PX", heat_kit:"ECB45-10CB-P",
    tonnage:3.0, seer2:15.20, eer2:13.00, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"215736127", total_price:3376, component_price:3376, notes:"VS air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V36P", furnace_model:null, coil_model:"7AH1AV36PX", heat_kit:"ECB45-10CB-P",
    tonnage:3.0, seer2:17.00, eer2:10.50, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"217202749", total_price:3931, component_price:3931, notes:"19 series inverter" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Best", application:"Multiposition",
    condenser_model:"A7CP21V36P", furnace_model:null, coil_model:"7AH2AV36PXC", heat_kit:"ECB48-9CB-P",
    tonnage:3.0, seer2:20.50, eer2:13.00, hspf2:null, cooling_cap:36000, afue:null,
    ahri_number:"217117575", total_price:6699, component_price:6144, notes:"Communicating inverter, includes ComfortSync" },

  // 3.5T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F42P", furnace_model:null, coil_model:"7AH1AE42PX", heat_kit:"ECB45-15CB-P",
    tonnage:3.5, seer2:14.30, eer2:12.20, hspf2:null, cooling_cap:42000, afue:null,
    ahri_number:"215743328", total_price:3439, component_price:3439, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F42P", furnace_model:null, coil_model:"7AH1AV48PX", heat_kit:"ECB45-15CB-P",
    tonnage:3.5, seer2:15.20, eer2:12.80, hspf2:null, cooling_cap:42000, afue:null,
    ahri_number:"215743331", total_price:3738, component_price:3738, notes:"VS air handler" },

  // 4.0T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F48P", furnace_model:null, coil_model:"7AH1AE60PX", heat_kit:"ECB45-15CB-P",
    tonnage:4.0, seer2:14.70, eer2:12.60, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"215747089", total_price:3803, component_price:3803, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F48P", furnace_model:null, coil_model:"7AH1AV48PX", heat_kit:"ECB45-15CB-P",
    tonnage:4.0, seer2:14.70, eer2:12.40, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"215747090", total_price:4462, component_price:4462, notes:"VS air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Best", application:"Multiposition",
    condenser_model:"A7CP21V48P", furnace_model:null, coil_model:"7AH2AV60PXC", heat_kit:"ECB48-15CB-P",
    tonnage:4.0, seer2:20.50, eer2:13.00, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"217117576", total_price:7451, component_price:6896, notes:"Communicating inverter, includes ComfortSync" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V60P", furnace_model:null, coil_model:"7AH1AV48PX", heat_kit:"ECB45-15CB-P",
    tonnage:4.0, seer2:18.50, eer2:11.50, hspf2:null, cooling_cap:48000, afue:null,
    ahri_number:"217203026", total_price:4838, component_price:4838, notes:"19 series inverter" },

  // 5.0T
  { brand:"Armstrong", system_type:"heat_pump", tier:"Good", application:"Multiposition",
    condenser_model:"A7HP14F60P", furnace_model:null, coil_model:"7AH1AE60PX", heat_kit:"ECB45-15CB-P",
    tonnage:5.0, seer2:14.30, eer2:11.70, hspf2:null, cooling_cap:60000, afue:null,
    ahri_number:"215747907", total_price:4724, component_price:4724, notes:"CT air handler" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Best", application:"Multiposition",
    condenser_model:"A7CP21V60P", furnace_model:null, coil_model:"7AH2AV60PXC", heat_kit:"ECB48-15CB-P",
    tonnage:5.0, seer2:20.50, eer2:13.00, hspf2:null, cooling_cap:60000, afue:null,
    ahri_number:"217117574", total_price:7914, component_price:7359, notes:"Communicating inverter, includes ComfortSync" },
  { brand:"Armstrong", system_type:"heat_pump", tier:"Better", application:"Multiposition",
    condenser_model:"A7HP19V60P", furnace_model:null, coil_model:"7AH1AV60PX", heat_kit:"ECB45-15CB-P",
    tonnage:5.0, seer2:16.50, eer2:9.80, hspf2:null, cooling_cap:60000, afue:null,
    ahri_number:"217464467", total_price:5313, component_price:5313, notes:"19 series inverter" },
];

const ALL_MATCHUPS = [...gasHeat, ...electric, ...heatPump];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const supabase = getSupabaseAdmin();

    // Delete existing Armstrong matchups
    const { error: deleteError } = await supabase
      .from("equipment_matchups")
      .delete()
      .eq("brand", "Armstrong");

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to clear existing Armstrong matchups: " + deleteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Cleared existing Armstrong matchups");

    // Prepare rows with CPS rebates calculated
    const rows = ALL_MATCHUPS.map(m => {
      const rebates = calculateCpsRebates(m.cooling_cap, m.seer2);
      return {
        brand: m.brand,
        system_type: m.system_type,
        tier: m.tier,
        application: m.application,
        condenser_model: m.condenser_model,
        furnace_model: m.furnace_model,
        coil_model: m.coil_model,
        heat_kit: m.heat_kit,
        tonnage: m.tonnage,
        seer2: m.seer2,
        eer2: m.eer2,
        hspf2: m.hspf2,
        cooling_cap: m.cooling_cap,
        afue: m.afue,
        ahri_number: m.ahri_number,
        total_price: m.total_price,
        component_price: m.component_price,
        notes: m.notes,
        cps_tonnage: rebates.cps_tonnage,
        early_rebate: rebates.early_rebate,
        burnout_rebate: rebates.burnout_rebate,
      };
    });

    // Batch insert (Supabase handles arrays fine)
    const { data, error: insertError } = await supabase
      .from("equipment_matchups")
      .insert(rows)
      .select("id");

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to insert matchups: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const count = data?.length || 0;
    console.log(`Inserted ${count} Armstrong matchups`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: count,
        breakdown: {
          gas_heat: gasHeat.length,
          electric: electric.length,
          heat_pump: heatPump.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Seed error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
