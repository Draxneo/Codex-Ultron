/**
 * Resolves a granular pay category from job metadata + equipment data.
 *
 * Pay categories (must match the keys in PayRatesCard):
 *   complete_install, service, one_off_maintenance,
 *   condenser_sale, condenser_install,
 *   coil_sale, coil_install,
 *   furnace_sale, furnace_install,
 *   air_handler_sale, air_handler_install,
 *   complete_system_sale, plan_sale, plan_visit
 */

export interface ResolvePayCategoryInput {
  jobType: string | null;
  /** Equipment types from job_equipment (e.g. ["condenser","coil","furnace"]) */
  equipmentTypes: string[];
  /** Whether this job is linked to a service agreement */
  hasServiceAgreement: boolean;
  /** Whether this is a sale-only (no install labor) */
  isSaleOnly?: boolean;
  /** Whether a plan was sold on this visit */
  isPlanSale?: boolean;
  /** Whether this is a diagnostic-only call (no repair performed) */
  isDiagnosticOnly?: boolean;
}

const EQUIPMENT_INSTALL_MAP: Record<string, string> = {
  condenser: "condenser_install",
  coil: "coil_install",
  furnace: "furnace_install",
  air_handler: "air_handler_install",
  "air handler": "air_handler_install",
};

const EQUIPMENT_SALE_MAP: Record<string, string> = {
  condenser: "condenser_sale",
  coil: "coil_sale",
  furnace: "furnace_sale",
  air_handler: "air_handler_sale",
  "air handler": "air_handler_sale",
};

export function resolvePayCategory(input: ResolvePayCategoryInput): string {
  const { jobType, equipmentTypes, hasServiceAgreement, isSaleOnly, isPlanSale, isDiagnosticOnly } = input;

  // Plan sale commission (explicit flag)
  if (isPlanSale) return "plan_sale";

  // Diagnostic-only call (no repair performed)
  if (isDiagnosticOnly) return "diagnostic";

  const type = (jobType || "").toLowerCase();

  // Phone calls — no commission applies
  if (type === "phone_call") return "phone_call";

  // Service calls
  if (type === "service" || type === "repair") return "service";

  // Maintenance
  if (type === "maintenance" || type === "tune-up" || type === "tune up") {
    return hasServiceAgreement ? "plan_visit" : "one_off_maintenance";
  }

  // Installs
  if (type === "install" || type === "replacement") {
    const normalized = equipmentTypes.map(e => e.toLowerCase().trim());
    const uniqueTypes = [...new Set(normalized)];

    // Multiple distinct equipment types = complete install or complete system sale
    if (uniqueTypes.length > 1) {
      return isSaleOnly ? "complete_system_sale" : "complete_install";
    }

    // Single equipment type
    if (uniqueTypes.length === 1) {
      const eqType = uniqueTypes[0];
      if (isSaleOnly) {
        return EQUIPMENT_SALE_MAP[eqType] || "complete_system_sale";
      }
      return EQUIPMENT_INSTALL_MAP[eqType] || "complete_install";
    }

    // No equipment data — default to complete install
    return isSaleOnly ? "complete_system_sale" : "complete_install";
  }

  // Estimate type shouldn't hit paysheet, but fall through gracefully
  if (type === "estimate") return "service";

  // Default fallback
  return "service";
}

/** Human-readable labels for pay categories (mirrors PayRatesCard) */
export const PAY_CATEGORY_LABELS: Record<string, string> = {
  complete_install: "Complete Install",
  service: "Service / Repair",
  one_off_maintenance: "One-Off Maintenance",
  condenser_sale: "Condenser Sale",
  condenser_install: "Condenser Install",
  coil_sale: "Coil Sale",
  coil_install: "Coil Install",
  furnace_sale: "Furnace Sale",
  furnace_install: "Furnace Install",
  air_handler_sale: "Air Handler Sale",
  air_handler_install: "Air Handler Install",
  complete_system_sale: "Complete System Sale",
  plan_sale: "Service Plan Sale",
  plan_visit: "Service Plan Visit",
  diagnostic: "Diagnostic / No-Repair",
  phone_call: "Phone Call",
};

export const PAY_CATEGORIES = Object.keys(PAY_CATEGORY_LABELS);
