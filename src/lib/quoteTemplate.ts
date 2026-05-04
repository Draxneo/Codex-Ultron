/**
 * quoteTemplate.ts — Shared HVAC install-quote description renderer.
 *
 * Single source of truth for the long-form quote text used by:
 *   - /quick-quote page (Copy + Push to HCP)
 *   - JARVIS "generate_install_quote" tool (chat output)
 *
 * Mirrors the desktop AI prompt 1:1 — Specifications, Models|Serials,
 * Rebate Info, CPS Rebate Amounts, Why Carnes & Sons, Install Includes,
 * Warranty Registration, Contact Info, CPS Rebate procedure block.
 */

import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import { calculatePrices, DEFAULT_FORMULA, type PricingFormula } from "@/hooks/usePricingFormulas";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";

export interface CompanyContact {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  tacla: string;
}

export interface RenderedQuote {
  description: string;
  cashPrice: number | null;
  financedPrice: number | null;
  /** Monthly payment for 0% APR · 36 mo (factor 0.0278). */
  monthlyPayment36: number | null;
  /** Monthly payment for 9.99% APR · 120 mo, Plan 943 (factor 0.0125). */
  monthlyPayment120: number | null;
  /** @deprecated Kept for backward compat — same value as monthlyPayment36. */
  monthlyPayment: number | null;
  earlyRebate: number | null;
  burnoutRebate: number | null;
}

const BRAND_CASING: Record<string, string> = {
  carrier: "Carrier",
  payne: "Payne",
  trane: "Trane",
  goodman: "Goodman",
  armstrong: "Armstrong",
  ducane: "Ducane",
  "day and night": "Day and Night",
  "day & night": "Day & Night",
  daynight: "Day and Night",
};

export function properBrand(brand: string): string {
  if (!brand) return "";
  const k = brand.trim().toLowerCase();
  if (BRAND_CASING[k]) return BRAND_CASING[k];
  return brand
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function systemTypeLabel(systemType: string | null): string {
  const k = (systemType || "").toLowerCase();
  if (k.includes("heat_pump") || k === "heat pump" || k.includes("heatpump")) return "Heat Pump";
  if (k.includes("dual")) return "Dual Fuel";
  if (k.includes("gas")) return "Gas";
  if (k.includes("electric")) return "Electric";
  return systemType || "";
}

function isGasLike(systemType: string | null): boolean {
  const k = (systemType || "").toLowerCase();
  return k.includes("gas") || k.includes("dual");
}

function stagingLabel(tier: string | null): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("ultimate") || t.includes("infinity") || t.includes("variable")) return "Variable Speed";
  if (t.includes("better") || t.includes("two") || t.includes("2-stage") || t.includes("two-stage")) return "2-Stage";
  return "Single Stage";
}

/**
 * High-end systems get +$500 material bump (300→800) and +$2000 markup
 * before the finance multiplier — matches the desktop prompt's Infinity rule.
 */
export function isHighEndSystem(matchup: Pick<EquipmentMatchup, "tier" | "application">): boolean {
  const tier = (matchup.tier || "").toLowerCase();
  const app = (matchup.application || "").toLowerCase();
  if (app.includes("package")) return true;
  return (
    tier.includes("ultimate") ||
    tier.includes("infinity") ||
    tier.includes("variable") ||
    tier.includes("two") ||
    tier.includes("2-stage") ||
    tier.includes("two-stage")
  );
}

/**
 * Compute cash + financed prices applying high-end overrides on top of
 * the brand/tier pricing formula.
 */
export function computeQuotePricing(
  matchup: Pick<EquipmentMatchup, "tier" | "application" | "component_price">,
  formula: PricingFormula | typeof DEFAULT_FORMULA
): { cashPrice: number | null; financedPrice: number | null; monthlyPayment36: number | null; monthlyPayment120: number | null } {
  if (matchup.component_price == null) {
    return { cashPrice: null, financedPrice: null, monthlyPayment36: null, monthlyPayment120: null };
  }
  const highEnd = isHighEndSystem(matchup);
  const adjusted = {
    ...formula,
    materials_fee: highEnd ? Math.max(formula.materials_fee, 800) : formula.materials_fee,
    profit_fee: formula.profit_fee + (highEnd ? 2000 : 0),
  };
  const prices = calculatePrices(matchup.component_price, adjusted);
  const cash = Math.round(prices.lowestMarginPrice * 100) / 100;
  const financed = Math.round(prices.financedPrice * 100) / 100;
  return {
    cashPrice: cash,
    financedPrice: financed,
    monthlyPayment36: calcMonthly36(financed),
    monthlyPayment120: calcMonthly120(financed),
  };
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "TBD";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMoneyWhole(n: number | null | undefined): string {
  if (n == null) return "TBD";
  return `$${Math.round(n).toLocaleString()}`;
}

function rebateRate(seer2: number | null): { earlyPer: number; burnoutPer: number } | null {
  if (seer2 == null) return null;
  if (seer2 >= 13.8 && seer2 <= 15.1) return { earlyPer: 115, burnoutPer: 90 };
  if (seer2 >= 15.2 && seer2 <= 16.1) return { earlyPer: 130, burnoutPer: 120 };
  if (seer2 >= 16.2 && seer2 <= 17.0) return { earlyPer: 175, burnoutPer: 150 };
  if (seer2 >= 17.1 && seer2 <= 19.9) return { earlyPer: 250, burnoutPer: 225 };
  if (seer2 >= 20.0) return { earlyPer: 310, burnoutPer: 275 };
  return null;
}

function modelsTable(matchup: EquipmentMatchup): string {
  const gas = isGasLike(matchup.system_type);
  if (gas) {
    return [
      "# Models  |  Serials",
      "",
      `➡️ OUTDOOR  - ${matchup.condenser_model || "TBD"}  |  [Outdoor Serial here]`,
      "",
      `➡️ FURNACE   - ${matchup.furnace_model || "TBD"}  |  [Furnace Serial here]`,
      "",
      `➡️ COIL             - ${matchup.coil_model || "TBD"}          |  [Coil Serial here]`,
    ].join("\n");
  }
  const indoor = matchup.furnace_model || matchup.coil_model || "TBD";
  return [
    "# Models  |  Serials",
    "",
    `➡️ OUTDOOR    - ${matchup.condenser_model || "TBD"}  |  [Outdoor Serial here]`,
    "",
    `➡️ INDOOR        - ${indoor}     |  [Indoor Serial here]`,
  ].join("\n");
}

function specificationsBlock(matchup: EquipmentMatchup): string {
  const gas = isGasLike(matchup.system_type);
  const lines: string[] = [
    "# Specifications",
    "",
    "➡️ Orientation: Multi-Pos",
    "",
    `➡️ ${gas ? "Outdoor Unit" : "Heat Pump"}: ${matchup.condenser_model || "TBD"}`,
    "",
    `➡️ ${gas ? "Furnace" : "Air Handler"}: ${matchup.furnace_model || matchup.coil_model || "TBD"}`,
  ];
  if (gas) {
    lines.push("", `➡️ Coil: ${matchup.coil_model || "TBD"}`);
  } else {
    lines.push("", `➡️ Heater: ${matchup.heat_kit || "TBD"}`);
  }
  return lines.join("\n");
}

function rebateInfoBlock(matchup: EquipmentMatchup, brand: string): string {
  const tons = matchup.cps_tonnage ?? matchup.tonnage ?? null;
  const rate = rebateRate(matchup.seer2);
  const earlyTotal = matchup.early_rebate ?? (rate && tons ? tons * rate.earlyPer : null);
  const burnoutTotal = matchup.burnout_rebate ?? (rate && tons ? tons * rate.burnoutPer : null);
  const tier = matchup.cps_rebate_tier || "Tier 1";
  const earlyCalc =
    rate && tons
      ? `${tons} tons × $${rate.earlyPer}/ton`
      : "see CPS rebate matrix";
  const burnoutCalc =
    rate && tons
      ? `${tons} tons × $${rate.burnoutPer}/ton`
      : "see CPS rebate matrix";

  return [
    "# Rebate Info",
    "",
    `➡️ SEER2: ${matchup.seer2 ?? "N/A"}`,
    "",
    `➡️ EER2: ${matchup.eer2 ?? "N/A"}`,
    "",
    `➡️ HSPF2: ${matchup.hspf2 ?? "N/A"}`,
    "",
    `➡️ Cooling Capacity in BTUs: ${matchup.cooling_cap ? matchup.cooling_cap.toLocaleString() : "N/A"}`,
    "",
    "➡️ Energy Star Certified?: No",
    "",
    `➡️ AHRI: ${matchup.ahri_number || "N/A"}`,
    "",
    "CPS REBATE AMOUNTS",
    "",
    `${tier} ${systemTypeLabel(matchup.system_type)} system (${matchup.seer2 ?? "?"} SEER2)`,
    "",
    `Early Replacement Rebate: ${fmtMoneyWhole(earlyTotal)} (${earlyCalc})`,
    "",
    `Replace on Burnout Rebate: ${fmtMoneyWhole(burnoutTotal)} (${burnoutCalc})`,
  ].join("\n");
}

function whyUsBlock(): string {
  return [
    "🤷‍♂️ Why Carnes and Sons:",
    "",
    "Family-owned & operated ",
    "",
    "All-inclusive pricing - no hidden fees",
    "",
    "10-year parts warranty included",
    "",
    "1-year labor warranty included* 10 Year Labor Warranty Available ",
    "",
    "2 years Comfort Club maintenance included",
    "",
    "Professional installation with safety features",
    "",
    "Clean, respectful service guaranteed",
  ].join("\n");
}

function installIncludesBlock(): string {
  return [
    "✓ Your Installation Includes:",
    "",
    "💰 All-Inclusive Pricing 💰",
    "",
    "✅ Our quotes include everything—permits, taxes, materials, and labor—so there are no surprises or hidden fees.",
    "",
    "🏠 Outdoor Unit Installation:",
    "",
    "✅ New pre-formed composite pad",
    "✅ Proper equipment leveling",
    "✅ New high-voltage emergency disconnect",
    "✅ New electrical whip(s)",
    "✅ Properly sized refrigerant lines",
    "✅ Re-insulated refrigerant lines",
    "✅ Factory-recommended start-up",
    "✅ EPA-compliant disposal",
    "",
    "🏡 Indoor Unit Installation:",
    "",
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
    "✅ Homeowner orientation",
    "",
    "🔧 System Start-Up & Quality Control:",
    "",
    "✅ Refrigerant charge verified",
    "✅ Electrical connections inspected",
    "✅ Final system walkthrough",
    "✅ Gas pressure tested",
    "✅ Full system operational testing",
    "✅ Complete jobsite cleanup",
  ].join("\n");
}

function warrantyBlock(brand: string): string {
  return [
    `🛡️ ${brand} 10 YEAR PARTS WARRANTY REGISTRATION — WE HANDLE IT FOR YOU`,
    "",
    "Get Peace of Mind with Industry-Leading Warranties",
    "",
    `Protect your home comfort investment. Your new ${brand} system is covered by a 10-year parts limited warranty when registered with the manufacturer within the required window after installation.`,
    "",
    "✅ WE TAKE CARE OF THE REGISTRATION FOR YOU",
    "",
    `As part of every install, our team registers your new equipment with ${brand} so you lock in the full 10-year parts warranty — no paperwork on your end. You'll receive a confirmation from ${brand} once registration is complete.`,
  ].join("\n");
}

function contactBlock(c: CompanyContact): string {
  const cityLine = [c.city, c.state, c.zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1");
  return [
    "📞 Contact Information",
    "",
    c.name || "Carnes and Sons Air Conditioning",
    "",
    `📍 ${[c.address, cityLine].filter(Boolean).join(", ")}`,
    "",
    `📞 ${c.phone}`,
    "",
    `🆔 Texas HVAC MASTERS License# ${c.tacla}`,
  ].join("\n");
}

function cpsRebateProcedureBlock(): string {
  return [
    "💵 CPS ENERGY REBATE — WE DO THE LEGWORK",
    "",
    "We help every qualifying customer claim their CPS Energy rebate. Our team gathers and prepares all the required documentation on your behalf and hands you a complete rebate packet — you just submit it through your CPS Energy account.",
    "",
    "📋 Qualification Requirements:",
    "",
    "To qualify for a rebate, newly installed systems must meet minimum efficiency ratings:",
    "",
    "14.3 SEER2",
    "",
    "11.7 EER2",
    "",
    "7.5 HSPF2",
    "",
    "📄 What We Provide For Your Rebate Packet:",
    "",
    "✅ AHRI certificate (pulled from your matched system)",
    "✅ Photos of your existing system (taken during our site visit — Early Replacement only)",
    "✅ Permit information (City of San Antonio only)",
    "✅ Itemized invoice from our licensed contractor including:",
    "   • Outdoor and indoor model and serial numbers",
    "   • Installation date and address",
    "   • Total cost paid",
    "",
    "👉 What We Need From You:",
    "",
    "✅ Your CPS Energy account (to submit the application)",
    "✅ About 10 minutes to upload the packet we prepare for you",
    "",
    "🔄 Early Replacement Requirements:",
    "",
    "Equipment must be less than 25 years old (central gas) or 20 years or less (heat pumps)",
    "",
    "Equipment must be operational to qualify",
    "",
    "Photos of all replaced equipment required (we capture these during our site visit)",
    "",
    "🏆 How Your Rebate Gets Submitted:",
    "",
    "STEP 1 — YOU: Create a rebate account using your CPS Energy account information",
    "",
    "STEP 2 — US: We prepare your complete rebate packet and hand it off to you",
    "",
    "STEP 3 — YOU: Upload the packet through the CPS rebate portal:",
    "",
    "   ✅ Select products for available rebates",
    "   ✅ Verify your eligibility",
    "   ✅ Review information and Terms & Conditions",
    "   ✅ Submit application and required documentation",
    "   ✅ Receive your rebate in the mail",
    "",
    "🔗 Apply for Rebates: https://cpsenergy.clearesult.com/",
    "",
    "These rebates apply to home improvement or retrofit projects only. Must be a one-for-one replacement. All HVAC equipment must be installed by an HVAC contractor licensed within the State of Texas.",
  ].join("\n");
}

function paymentOptionsBlock(
  financed: number | null,
  monthly36: number | null,
  monthly120: number | null,
  rebatePrice: number | null
): string {
  const lines = [
    "💳 CHOOSE ONE PAYMENT OPTION",
    "",
    "OPTION A — 0% APR · 36 Months",
    `   ${fmtMoney(monthly36)}/mo  (${fmtMoney(financed)} financed)`,
    "",
    "OPTION B — 9.99% APR · 120 Months  ★ LOWEST MONTHLY",
    `   ${fmtMoney(monthly120)}/mo  (${fmtMoney(financed)} financed)`,
    "",
    "OPTION C — Instant Factory Rebate  ★ BEST PRICE",
    `   ${fmtMoney(rebatePrice)} one-time`,
  ];
  if (financed != null && rebatePrice != null && financed > rebatePrice) {
    lines.push(`   (Save ${fmtMoneyWhole(financed - rebatePrice)} vs. financed)`);
  }
  return lines.join("\n");
}

/**
 * Render the complete install-quote description for a matchup.
 */
export function renderInstallQuote(
  matchup: EquipmentMatchup,
  formula: PricingFormula | typeof DEFAULT_FORMULA,
  company: CompanyContact
): RenderedQuote {
  const brand = properBrand(matchup.brand);
  const tons = matchup.tonnage ?? "";
  const staging = stagingLabel(matchup.tier);
  const sysLabel = systemTypeLabel(matchup.system_type);
  const series = matchup.tier ? `${matchup.tier} Series` : "";
  const heading = `${brand} ${tons} Ton ${staging} ${sysLabel}${series ? ` ${series}` : ""}:`;

  const pricing = computeQuotePricing(matchup, formula);
  const financed = pricing.financedPrice ?? matchup.total_price ?? null;
  const monthly36 = pricing.monthlyPayment36 ?? matchup.monthly_payment ?? null;
  const monthly120 = pricing.monthlyPayment120 ?? matchup.monthly_payment_120 ?? null;
  const rebatePrice = matchup.factory_rebate_price ?? financed;

  const description = [
    heading,
    "",
    paymentOptionsBlock(financed, monthly36, monthly120, rebatePrice),
    "",
    specificationsBlock(matchup),
    "",
    modelsTable(matchup),
    "",
    rebateInfoBlock(matchup, brand),
    "",
    whyUsBlock(),
    "",
    installIncludesBlock(),
    "",
    warrantyBlock(brand),
    "",
    contactBlock(company),
    "",
    cpsRebateProcedureBlock(),
  ].join("\n");

  return {
    description,
    cashPrice: pricing.cashPrice,
    financedPrice: financed,
    monthlyPayment36: monthly36,
    monthlyPayment120: monthly120,
    monthlyPayment: monthly36, // deprecated alias
    earlyRebate: matchup.early_rebate ?? null,
    burnoutRebate: matchup.burnout_rebate ?? null,
  };
}

/**
 * Standard "no matchup" error message — same wording on UI and JARVIS.
 */
export function noMatchupMessage(brand: string, tonnage: number | string, systemType: string): string {
  const sys = systemTypeLabel(systemType) || systemType;
  return `No matchup for ${properBrand(brand)} ${tonnage} ton ${sys} — add it in Equipment Matchups before quoting.`;
}
