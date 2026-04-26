/**
 * generate-install-quote — Deterministic install quote generator.
 *
 * Mirrors the desktop AI prompt 1:1 — pulls a matchup from equipment_matchups,
 * runs pricing through pricing_formulas (with high-end overrides), and renders
 * the full templated description (Specifications, Models|Serials, Rebate Info,
 * CPS Rebate Amounts, Why Carnes & Sons, install checklist, warranty,
 * contact, CPS rebate procedure).
 *
 * Used by:
 *   - JARVIS `generate_install_quote` tool
 *   - Optional direct fetch from the UI for shared output
 *
 * Returns clear error strings if the brand/tonnage/system isn't in the matchup
 * table — never invents data.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { calcMonthly36, calcMonthly120 } from "../_shared/paymentOptions.ts";

interface RequestBody {
  brand: string;
  tonnage: number;
  system_type: string; // heat_pump | gas_heat | electric | dual_fuel
  application?: string; // Multiposition | Vertical | Horizontal | Package
  tier?: string;
}

const BRAND_CASING: Record<string, string> = {
  carrier: "Carrier", payne: "Payne", trane: "Trane", goodman: "Goodman",
  armstrong: "Armstrong", ducane: "Ducane",
  "day and night": "Day and Night", "day & night": "Day & Night",
};
function properBrand(b: string): string {
  if (!b) return "";
  const k = b.trim().toLowerCase();
  if (BRAND_CASING[k]) return BRAND_CASING[k];
  return b.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function systemTypeLabel(s: string | null): string {
  const k = (s || "").toLowerCase();
  if (k.includes("heat_pump") || k === "heat pump" || k.includes("heatpump")) return "Heat Pump";
  if (k.includes("dual")) return "Dual Fuel";
  if (k.includes("gas")) return "Gas";
  if (k.includes("electric")) return "Electric";
  return s || "";
}
function isGasLike(s: string | null): boolean {
  const k = (s || "").toLowerCase();
  return k.includes("gas") || k.includes("dual");
}
function stagingLabel(t: string | null): string {
  const k = (t || "").toLowerCase();
  if (k.includes("ultimate") || k.includes("infinity") || k.includes("variable")) return "Variable Speed";
  if (k.includes("better") || k.includes("two") || k.includes("2-stage")) return "2-Stage";
  return "Single Stage";
}
function isHighEnd(m: any): boolean {
  const t = (m.tier || "").toLowerCase();
  const a = (m.application || "").toLowerCase();
  if (a.includes("package")) return true;
  return t.includes("ultimate") || t.includes("infinity") || t.includes("variable") ||
    t.includes("two") || t.includes("2-stage");
}
function rebateRate(seer2: number | null) {
  if (seer2 == null) return null;
  if (seer2 >= 13.8 && seer2 <= 15.1) return { earlyPer: 115, burnoutPer: 90 };
  if (seer2 >= 15.2 && seer2 <= 16.1) return { earlyPer: 130, burnoutPer: 120 };
  if (seer2 >= 16.2 && seer2 <= 17.0) return { earlyPer: 175, burnoutPer: 150 };
  if (seer2 >= 17.1 && seer2 <= 19.9) return { earlyPer: 250, burnoutPer: 225 };
  if (seer2 >= 20.0) return { earlyPer: 310, burnoutPer: 275 };
  return null;
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "TBD";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMoneyWhole(n: number | null | undefined): string {
  if (n == null) return "TBD";
  return `$${Math.round(n).toLocaleString()}`;
}

function computePricing(matchup: any, formula: any) {
  if (matchup.component_price == null) {
    return { cashPrice: null, financedPrice: null, monthlyPayment36: null, monthlyPayment120: null };
  }
  const highEnd = isHighEnd(matchup);
  const materialsFee = highEnd ? Math.max(formula.materials_fee, 800) : formula.materials_fee;
  const profitFee = formula.profit_fee + (highEnd ? 2000 : 0);
  const subtotal = matchup.component_price + materialsFee + formula.labor_fee + profitFee;
  const tax = subtotal * (formula.tax_rate / 100);
  const cash = subtotal + tax;
  const financed = cash * (1 + formula.finance_rate / 100);
  const financedRounded = Math.round(financed * 100) / 100;
  return {
    cashPrice: Math.round(cash * 100) / 100,
    financedPrice: financedRounded,
    monthlyPayment36: calcMonthly36(financedRounded),
    monthlyPayment120: calcMonthly120(financedRounded),
  };
}

function renderDescription(m: any, brand: string, company: any, pricing: any): string {
  const gas = isGasLike(m.system_type);
  const tons = m.cps_tonnage ?? m.tonnage ?? null;
  const rate = rebateRate(m.seer2);
  const earlyTotal = m.early_rebate ?? (rate && tons ? tons * rate.earlyPer : null);
  const burnoutTotal = m.burnout_rebate ?? (rate && tons ? tons * rate.burnoutPer : null);
  const tier = m.cps_rebate_tier || "Tier 1";

  const heading = `${brand} ${m.tonnage ?? ""} Ton ${stagingLabel(m.tier)} ${systemTypeLabel(m.system_type)}${m.tier ? ` ${m.tier} Series` : ""}:`;

  const specs = gas
    ? [
        "# Specifications", "",
        "➡️ Orientation: Multi-Pos", "",
        `➡️ Outdoor Unit: ${m.condenser_model || "TBD"}`, "",
        `➡️ Furnace: ${m.furnace_model || "TBD"}`, "",
        `➡️ Coil: ${m.coil_model || "TBD"}`,
      ].join("\n")
    : [
        "# Specifications", "",
        "➡️ Orientation: Multi-Pos", "",
        `➡️ Heat Pump: ${m.condenser_model || "TBD"}`, "",
        `➡️ Air Handler: ${m.furnace_model || m.coil_model || "TBD"}`, "",
        `➡️ Heater: ${m.heat_kit || "TBD"}`,
      ].join("\n");

  const models = gas
    ? [
        "# Models  |  Serials", "",
        `➡️ OUTDOOR  - ${m.condenser_model || "TBD"}  |  [Outdoor Serial here]`, "",
        `➡️ FURNACE   - ${m.furnace_model || "TBD"}  |  [Furnace Serial here]`, "",
        `➡️ COIL             - ${m.coil_model || "TBD"}          |  [Coil Serial here]`,
      ].join("\n")
    : [
        "# Models  |  Serials", "",
        `➡️ OUTDOOR    - ${m.condenser_model || "TBD"}  |  [Outdoor Serial here]`, "",
        `➡️ INDOOR        - ${m.furnace_model || m.coil_model || "TBD"}     |  [Indoor Serial here]`,
      ].join("\n");

  const rebate = [
    "# Rebate Info", "",
    `➡️ SEER2: ${m.seer2 ?? "N/A"}`, "",
    `➡️ EER2: ${m.eer2 ?? "N/A"}`, "",
    `➡️ HSPF2: ${m.hspf2 ?? "N/A"}`, "",
    `➡️ Cooling Capacity in BTUs: ${m.cooling_cap ? Number(m.cooling_cap).toLocaleString() : "N/A"}`, "",
    "➡️ Energy Star Certified?: No", "",
    `➡️ AHRI: ${m.ahri_number || "N/A"}`, "",
    "CPS REBATE AMOUNTS", "",
    `${tier} ${systemTypeLabel(m.system_type)} system (${m.seer2 ?? "?"} SEER2)`, "",
    `Early Replacement Rebate: ${fmtMoneyWhole(earlyTotal)} (${rate && tons ? `${tons} tons × $${rate.earlyPer}/ton` : "see CPS rebate matrix"})`, "",
    `Replace on Burnout Rebate: ${fmtMoneyWhole(burnoutTotal)} (${rate && tons ? `${tons} tons × $${rate.burnoutPer}/ton` : "see CPS rebate matrix"})`,
  ].join("\n");

  const why = [
    "🤷‍♂️ Why Carnes and Sons:", "",
    "Family-owned & operated ", "",
    "All-inclusive pricing - no hidden fees", "",
    "10-year parts warranty included", "",
    "1-year labor warranty included* 10 Year Labor Warranty Available ", "",
    "2 years Comfort Club maintenance included", "",
    "Professional installation with safety features", "",
    "Clean, respectful service guaranteed",
  ].join("\n");

  const includes = [
    "✓ Your Installation Includes:", "",
    "💰 All-Inclusive Pricing 💰", "",
    "✅ Our quotes include everything—permits, taxes, materials, and labor—so there are no surprises or hidden fees.", "",
    "🏠 Outdoor Unit Installation:", "",
    "✅ New pre-formed composite pad",
    "✅ Proper equipment leveling",
    "✅ New high-voltage emergency disconnect",
    "✅ New electrical whip(s)",
    "✅ Properly sized refrigerant lines",
    "✅ Re-insulated refrigerant lines",
    "✅ Factory-recommended start-up",
    "✅ EPA-compliant disposal", "",
    "🏡 Indoor Unit Installation:", "",
    "✅ Safe removal of existing equipment",
    "✅ Multi-positional furnace & evaporator coil",
    "✅ Gas line connection & leak testing",
    "✅ New primary drain pan",
    "✅ Ceiling saver pan",
    "✅ Float safety switch",
    "✅ Secure mounting",
    "✅ Re-sealed plenums",
    "✅ Sealed duct connections",
    "✅ Proper condensate drain piping",
    "✅ New thermostat installation",
    "✅ Homeowner orientation", "",
    "🔧 System Start-Up & Quality Control:", "",
    "✅ Refrigerant charge verified",
    "✅ Electrical connections inspected",
    "✅ Final system walkthrough",
    "✅ Gas pressure tested",
    "✅ Full system operational testing",
    "✅ Complete jobsite cleanup",
  ].join("\n");

  const warranty = [
    `🛡️ ${brand} 10 YEAR PARTS WARRANTY REGISTRATION — WE HANDLE IT FOR YOU`, "",
    "Get Peace of Mind with Industry-Leading Warranties", "",
    `Protect your home comfort investment. Your new ${brand} system is covered by a 10-year parts limited warranty when registered with the manufacturer within the required window after installation.`, "",
    "✅ WE TAKE CARE OF THE REGISTRATION FOR YOU", "",
    `As part of every install, our team registers your new equipment with ${brand} so you lock in the full 10-year parts warranty — no paperwork on your end. You'll receive a confirmation from ${brand} once registration is complete.`,
  ].join("\n");

  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  const contact = [
    "📞 Contact Information", "",
    company.name || "Carnes and Sons Air Conditioning", "",
    `📍 ${[company.address, cityLine].filter(Boolean).join(", ")}`, "",
    `📞 ${company.phone}`, "",
    `🆔 Texas HVAC MASTERS License# ${company.tacla}`,
  ].join("\n");

  const cpsProc = [
    "💵 CPS ENERGY REBATE — WE DO THE LEGWORK", "",
    "We help every qualifying customer claim their CPS Energy rebate. Our team gathers and prepares all the required documentation on your behalf and hands you a complete rebate packet — you just submit it through your CPS Energy account.", "",
    "📋 Qualification Requirements:", "",
    "To qualify for a rebate, newly installed systems must meet minimum efficiency ratings:", "",
    "14.3 SEER2", "", "11.7 EER2", "", "7.5 HSPF2", "",
    "📄 What We Provide For Your Rebate Packet:", "",
    "✅ AHRI certificate (pulled from your matched system)",
    "✅ Photos of your existing system (taken during our site visit — Early Replacement only)",
    "✅ Permit information (City of San Antonio only)",
    "✅ Itemized invoice from our licensed contractor including:",
    "   • Outdoor and indoor model and serial numbers",
    "   • Installation date and address",
    "   • Total cost paid", "",
    "👉 What We Need From You:", "",
    "✅ Your CPS Energy account (to submit the application)",
    "✅ About 10 minutes to upload the packet we prepare for you", "",
    "🔄 Early Replacement Requirements:", "",
    "Equipment must be less than 25 years old (central gas) or 20 years or less (heat pumps)", "",
    "Equipment must be operational to qualify", "",
    "Photos of all replaced equipment required (we capture these during our site visit)", "",
    "🏆 How Your Rebate Gets Submitted:", "",
    "STEP 1 — YOU: Create a rebate account using your CPS Energy account information", "",
    "STEP 2 — US: We prepare your complete rebate packet and hand it off to you", "",
    "STEP 3 — YOU: Upload the packet through the CPS rebate portal:", "",
    "   ✅ Select products for available rebates",
    "   ✅ Verify your eligibility",
    "   ✅ Review information and Terms & Conditions",
    "   ✅ Submit application and required documentation",
    "   ✅ Receive your rebate in the mail", "",
    "🔗 Apply for Rebates: https://cpsenergy.clearesult.com/", "",
    "These rebates apply to home improvement or retrofit projects only. Must be a one-for-one replacement. All HVAC equipment must be installed by an HVAC contractor licensed within the State of Texas.",
  ].join("\n");

  return [heading, "", specs, "", models, "", rebate, "", why, "", includes, "", warranty, "", contact, "", cpsProc].join("\n");
}

async function loadFormula(sb: any, brand: string, tier: string | null) {
  const { data } = await sb.from("pricing_formulas").select("*");
  const all = (data || []) as any[];
  const exact = all.find((f) => f.brand === brand && f.tier === tier);
  if (exact) return exact;
  const brandDefault = all.find((f) => f.brand === brand && f.tier === null);
  if (brandDefault) return brandDefault;
  const globalTier = all.find((f) => f.brand === "default" && f.tier === tier);
  if (globalTier) return globalTier;
  const globalDefault = all.find((f) => f.brand === "default" && f.tier === null);
  if (globalDefault) return globalDefault;
  return { materials_fee: 300, tax_rate: 8.25, labor_fee: 1000, profit_fee: 4000, finance_rate: 16, cash_rebate: 0 };
}

async function loadCompany(sb: any) {
  const { data } = await sb
    .from("company_settings")
    .select("key, value")
    .in("key", ["company_name", "company_phone", "company_address", "company_city", "company_state", "company_zip", "tacla_number"]);
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return {
    name: map.company_name || "Carnes and Sons Air Conditioning",
    phone: map.company_phone || "210-600-5091",
    address: map.company_address || "9988 Macaway Road",
    city: map.company_city || "Adkins",
    state: map.company_state || "Texas",
    zip: map.company_zip || "78101",
    tacla: map.tacla_number || "TACLB29435E",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.brand || !body.tonnage || !body.system_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: brand, tonnage, system_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find matchup — prefer Multi-Pos, then orientation fallback
    let q = sb.from("equipment_matchups").select("*")
      .ilike("brand", body.brand)
      .eq("tonnage", body.tonnage)
      .ilike("system_type", body.system_type);
    if (body.tier) q = q.ilike("tier", body.tier);
    const { data: all, error } = await q;
    if (error) throw error;

    if (!all || all.length === 0) {
      const msg = `No matchup for ${properBrand(body.brand)} ${body.tonnage} ton ${systemTypeLabel(body.system_type)} — add it in Equipment Matchups before quoting.`;
      return new Response(JSON.stringify({ status: "no_match", message: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prefer Multiposition; fall back to requested orientation; then anything
    const targetApp = body.application;
    const multi = all.find((m: any) => m.application === "Multiposition");
    const oriented = targetApp ? all.find((m: any) => (m.application || "").toLowerCase() === targetApp.toLowerCase()) : null;
    const matchup = multi || oriented || all[0];

    const formula = await loadFormula(sb, matchup.brand, matchup.tier ?? null);
    const company = await loadCompany(sb);
    const pricing = computePricing(matchup, formula);
    const brand = properBrand(matchup.brand);
    const description = renderDescription(matchup, brand, company, pricing);

    const financedPriceFinal = pricing.financedPrice ?? matchup.total_price ?? null;
    const monthly36 = pricing.monthlyPayment36 ?? matchup.monthly_payment ?? null;
    const monthly120 =
      pricing.monthlyPayment120
      ?? matchup.monthly_payment_120
      ?? calcMonthly120(financedPriceFinal);
    return new Response(
      JSON.stringify({
        status: "success",
        matchup_id: matchup.id,
        brand,
        tonnage: matchup.tonnage,
        system_type: matchup.system_type,
        tier: matchup.tier,
        description,
        instant_rebate_price: matchup.factory_rebate_price ?? pricing.cashPrice ?? null,
        financed_price: financedPriceFinal,
        monthly_payment_36: monthly36,
        monthly_payment_120: monthly120,
        // deprecated aliases for backward compat
        cash_price: pricing.cashPrice ?? matchup.factory_rebate_price ?? null,
        monthly_payment: monthly36,
        early_rebate: matchup.early_rebate,
        burnout_rebate: matchup.burnout_rebate,
        cps_rebate_tier: matchup.cps_rebate_tier,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("generate-install-quote error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
