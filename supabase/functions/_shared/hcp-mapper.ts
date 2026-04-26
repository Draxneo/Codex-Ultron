/**
 * Shared HCP ↔ Local mapping utilities.
 * Used by both hcp-webhook and sync-hcp-jobs to guarantee identical field mapping.
 *
 * ⚠️ PRICE NOTE: HCP POST endpoints use CENTS for unit_price/unit_cost,
 * but GET responses return DOLLARS. Our sync code reads GETs (dollars) and
 * stores as-is. Any future code that PUSHES line items to HCP must multiply by 100.
 */

import { formatName, formatAddress, formatCity, formatState, formatEmail, formatPhone, toCentralDate } from "./formatters.ts";

// ── Parsing helpers ──

export function parseAhriNumber(text: string): string | null {
  if (!text) return null;
  const ahriMatch = text.match(/ahri[:#\s]*(\d{7,10})/i);
  if (ahriMatch) return ahriMatch[1];
  const digitMatch = text.match(/\b(\d{9,10})\b/);
  return digitMatch ? digitMatch[1] : null;
}

export function parseTonnage(desc: string): number | null {
  if (!desc) return null;
  const halfMatch = desc.match(/(\d+)\s*[-–]\s*1\s*\/\s*2\s*ton/i);
  if (halfMatch) return parseInt(halfMatch[1]) + 0.5;
  const match = desc.match(/(\d+(?:\.\d+)?)\s*[-–]?\s*ton(?:s|ne)?(?:\b|$)/i);
  if (match) return parseFloat(match[1]);
  return null;
}

export function parseSystemType(desc: string): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes("dual fuel")) return "dual_fuel";
  if (d.includes("heat pump") || d.includes("heatpump")) return "heat_pump";
  if (d.includes("gas heat") || d.includes("gas-heat") || d.includes("multi-position gas") || d.includes("multi-pos") || (d.includes("furnace") && (d.includes("condenser") || d.includes("ac") || d.includes("a/c")))) return "gas_heat";
  if (d.includes("straight cool") || d.includes("straight a/c")) return "straight_cool";
  if (d.includes("electric heat") || d.includes("electric system")) return "electric_heat";
  if (d.includes("furnace") && !d.includes("heat pump") && !d.includes("heatpump")) return "gas_heat";
  return null;
}

export function parseBrand(desc: string): string | null {
  if (!desc) return null;
  const brands: [RegExp, string][] = [
    [/\bcarrier\b/i, "Carrier"],
    [/\bday\s*(?:&|and)\s*night\b/i, "Day and Night"],
    [/\bpayne\b/i, "Payne"],
    [/\bbryant\b/i, "Bryant"],
    [/\bgoodman\b/i, "Goodman"],
    [/\btrane\b/i, "Trane"],
    [/\blennox\b/i, "Lennox"],
    [/\brheem\b/i, "Rheem"],
    [/\bruud\b/i, "Ruud"],
    [/\byork\b/i, "York"],
    [/\bdaikin\b/i, "Daikin"],
    [/\bamana\b/i, "Amana"],
    [/\bamerican\s*standard\b/i, "American Standard"],
    [/\bcomfortmaker\b/i, "Comfortmaker"],
    [/\bheil\b/i, "Heil"],
    [/\btempstar\b/i, "Tempstar"],
    [/\bbosch\b/i, "Bosch"],
    [/\bmitsubishi\b/i, "Mitsubishi"],
    [/\bfujitsu\b/i, "Fujitsu"],
  ];
  for (const [re, name] of brands) {
    if (re.test(desc)) return name;
  }
  return null;
}

// ── Job type detection ──

export function determineJobType(hcpJob: any): string {
  const tags = (hcpJob.tags || []).map((t: any) => (typeof t === "string" ? t : t.name || "").toLowerCase());
  const desc = (hcpJob.description || "").toLowerCase();
  const note = (hcpJob.note || "").toLowerCase();
  const jtField = (hcpJob.job_type || "").toLowerCase();
  const searchText = `${tags.join(" ")} ${desc} ${note} ${jtField}`;

  const maintenanceWords = ["maintenance", "tune-up", "tune up", "tuneup", "free tune", "pm visit", "seasonal", "clean and check", "clean & check", "preventive", "preventative"];
  const installWords = ["install", "installation", "new system", "new unit", "new ac", "new furnace", "heat pump install", "changeout", "change out", "seer2", "hspf2", "eer2", "ahri", "furnace dimensions", "supply dimensions", "return dimensions", "cooling capacity", "variable speed", "payne comfort", "carrier comfort", "gas heat system", "heat pump system", "split system", "multi-position gas", "multi-pos", "value series", "comfort series", "performance series", "infinity series", "infinity vs"];
  const serviceWords = ["contactor", "capacitor", "fuse", "relay", "thermostat replacement", "valve replacement", "compressor replacement", "motor replacement", "blower motor", "fan motor", "wiring repair", "leak repair", "refrigerant", "recharge", "diagnostic", "no cool", "no heat", "not cooling", "not heating", "duct clean", "duct repair", "coil replacement", "coil/ cooling coil", "evaporator coil", "troubleshoot"];

  if (maintenanceWords.some(w => searchText.includes(w))) return "maintenance";

  const fullText = `${hcpJob.description || ""}\n${hcpJob.note || ""}`;
  const hasBrand = parseBrand(fullText) !== null;
  const hasTonnage = parseTonnage(fullText) !== null;
  if (hasBrand && hasTonnage) return "install";

  if (installWords.some(w => searchText.includes(w))) return "install";
  if (serviceWords.some(w => searchText.includes(w))) return "service";

  return "service";
}

// ── Status mapping ──

export function mapHcpJobStatus(workStatus: string | null, scheduledDate: string | null): string {
  const ws = (workStatus || "").toLowerCase();
  if (ws.includes("cancel")) return "canceled";
  if (ws.includes("complete")) return "done";
  return scheduledDate ? "scheduled" : "new";
}

export function mapHcpEstimateStatus(workStatus: string | null): string {
  const ws = (workStatus || "").toLowerCase();
  if (ws.includes("cancel")) return "canceled";
  if (ws.includes("created job") || ws === "won") return "won";
  if (ws === "unscheduled" || ws === "needs scheduling") return "new";
  if (ws === "scheduled" || ws === "in progress" || ws.includes("complete")) return "scheduled";
  if (ws === "lost") return "lost";
  if (!ws) return "new";
  return "new";
}

// ── Assigned tech extraction ──
// HCP can send tech info in several shapes; try all known fields.

export function extractAssignedTo(hcpRecord: any): string | null {
  // 1. assigned_employees array (most common)
  const ae = hcpRecord.assigned_employees;
  if (Array.isArray(ae) && ae.length > 0) {
    const emp = ae[0];
    // Could be { first_name, last_name } or { name } or plain string
    if (emp.first_name) return `${emp.first_name} ${emp.last_name || ""}`.trim();
    if (emp.name) return emp.name;
    if (typeof emp === "string") return emp;
  }

  // 2. dispatched_employees fallback
  const de = hcpRecord.dispatched_employees;
  if (Array.isArray(de) && de.length > 0) {
    const emp = de[0];
    if (emp.first_name) return `${emp.first_name} ${emp.last_name || ""}`.trim();
    if (emp.name) return emp.name;
    if (typeof emp === "string") return emp;
  }

  // 3. technician / technicians field
  const techs = hcpRecord.technicians || hcpRecord.technician;
  if (Array.isArray(techs) && techs.length > 0) {
    const t = techs[0];
    if (t.first_name) return `${t.first_name} ${t.last_name || ""}`.trim();
    if (t.name) return t.name;
    if (typeof t === "string") return t;
  }
  if (techs && typeof techs === "object" && !Array.isArray(techs)) {
    if (techs.first_name) return `${techs.first_name} ${techs.last_name || ""}`.trim();
    if (techs.name) return techs.name;
  }

  // 4. employee_ids + schedule.dispatched_employees (nested)
  const schedDisp = hcpRecord.schedule?.dispatched_employees;
  if (Array.isArray(schedDisp) && schedDisp.length > 0) {
    const emp = schedDisp[0];
    if (emp.first_name) return `${emp.first_name} ${emp.last_name || ""}`.trim();
    if (emp.name) return emp.name;
  }

  return null;
}

// ── Canonical job mapper ──
// Returns the field object suitable for upserting into public.jobs

export function mapHcpJobToFields(hcpJob: any): Record<string, any> {
  const rawCustomerName = hcpJob.customer
    ? `${hcpJob.customer.first_name || ""} ${hcpJob.customer.last_name || ""}`.trim()
    : "Unknown";
  const customerName = formatName(rawCustomerName) || "Unknown";
  const customerPhone = formatPhone(hcpJob.customer?.mobile_number || hcpJob.customer?.home_number || hcpJob.customer?.work_number || hcpJob.customer?.phone_number || null);
  const customerEmail = formatEmail(hcpJob.customer?.email || null);
  const hcpCustomerId = hcpJob.customer?.id || null;
  const address = hcpJob.address
    ? formatAddress(`${hcpJob.address.street || ""}, ${hcpJob.address.city || ""}, ${hcpJob.address.state || ""} ${hcpJob.address.zip || ""}`.trim())
    : null;
  // Use Central-Time date so late-evening jobs don't roll forward to the next day.
  const scheduledDate = toCentralDate(hcpJob.schedule?.scheduled_start);
  const assignedTo = extractAssignedTo(hcpJob);

  const desc = hcpJob.description || "";
  const note = hcpJob.note || "";
  const fullText = `${desc}\n${note}`.trim();

  const result: Record<string, any> = {
    hcp_id: hcpJob.id,
    hcp_job_number: hcpJob.invoice_number || hcpJob.job_number || hcpJob.number || null,
    job_number: hcpJob.invoice_number || hcpJob.job_number || hcpJob.number || null,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    hcp_customer_id: hcpCustomerId,
    address,
    job_type: determineJobType(hcpJob),
    scheduled_date: scheduledDate,
    assigned_to: assignedTo,
    hcp_status: hcpJob.work_status || null,
    synced_at: new Date().toISOString(),
    created_at: hcpJob.created_at || new Date().toISOString(),
    arrival_start: hcpJob.schedule?.scheduled_start || null,
    arrival_end: hcpJob.schedule?.scheduled_end || null,
  };

  if (note) result.hcp_note = note;

  if (desc) {
    result.description = desc;
    result.tonnage = parseTonnage(fullText);
    result.system_type = parseSystemType(fullText);
    result.brand = parseBrand(fullText);
  }

  const ahri = parseAhriNumber(fullText);
  if (ahri) result.ahri_number = ahri;

  return result;
}

// ── Canonical estimate mapper ──

export function mapHcpEstimateToFields(est: any): Record<string, any> {
  const cust = est.customer || {};
  const rawCustName = `${cust.first_name || ""} ${cust.last_name || ""}`.trim() || null;
  const custName = formatName(rawCustName);
  const addr = est.address
    ? `${est.address.street || ""}, ${est.address.city || ""}, ${est.address.state || ""} ${est.address.zip || ""}`.trim()
    : null;
  // Use Central-Time date so late-evening estimates don't roll forward to the next day.
  const scheduledDate = toCentralDate(est.schedule?.scheduled_start);
  const assignedTo = extractAssignedTo(est);

  return {
    hcp_id: est.id,
    estimate_number: est.estimate_number || null,
    customer_name: custName,
    customer_phone: formatPhone(cust.mobile_number || cust.home_number || cust.work_number || cust.phone_number || null),
    customer_email: formatEmail(cust.email || null),
    hcp_customer_id: cust.id || null,
    address: formatAddress(addr),
    assigned_to: assignedTo,
    scheduled_date: scheduledDate,
    description: est.description || null,
    options: est.options || [],
    // Note: estimates table has no lead_source / total_amount columns — intentionally omitted
    synced_at: new Date().toISOString(),
    arrival_start: est.schedule?.arrival_window_start || est.schedule?.scheduled_start || null,
    arrival_end: est.schedule?.arrival_window_end || est.schedule?.scheduled_end || null,
    created_at: est.created_at || new Date().toISOString(),
  };
}

// ── Smart diff: returns only changed fields (or null if nothing changed) ──

const SYNC_COMPARE_KEYS = [
  "assigned_to", "hcp_status", "scheduled_date", "arrival_start", "arrival_end",
  "address", "customer_name", "customer_phone", "customer_email", "job_type",
  "description", "hcp_note", "tonnage", "system_type", "brand", "ahri_number",
  "hcp_job_number", "job_number",
];

export function diffJobFields(
  incoming: Record<string, any>,
  existing: Record<string, any>,
): Record<string, any> | null {
  const changed: Record<string, any> = {};
  for (const key of SYNC_COMPARE_KEYS) {
    const inc = incoming[key] ?? null;
    const ext = existing[key] ?? null;
    // Skip if incoming is null (don't clear existing data)
    if (inc === null) continue;
    if (String(inc) !== String(ext)) {
      changed[key] = inc;
    }
  }
  if (Object.keys(changed).length === 0) return null;
  changed.synced_at = new Date().toISOString();
  return changed;
}
