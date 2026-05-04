/**
 * roleAccessDefaults.ts — Single source of truth for role → page-access defaults.
 *
 * Mirrors the `get_role_default_tabs(role)` SQL function. Keep these in sync.
 *
 * 2026-05-03 redesign: keys now align with the 7 Operating HQs (Intake, Now,
 * Dispatch, Tech, Quote, Customer, Team) plus 5 utility surfaces (Phone, SMS,
 * JARVIS, Pay, Admin). Old keys (jobs/inbox/chat/customers/copilot) were
 * deprecated and migrated by `permissions_align_with_hq_structure`.
 */

export type RoleKey = "admin" | "office" | "supervisor" | "tech" | "installer";

export const ROLE_DEFAULTS: Record<RoleKey, string[]> = {
  // Admin — full access to everything
  admin:      ["tech", "intake", "now", "dispatch", "quote", "customer", "team", "phone", "sms", "jarvis", "pay", "admin"],
  // Office — full office workflow, no tech mobile, no admin settings
  office:     ["intake", "now", "dispatch", "quote", "customer", "team", "phone", "sms", "jarvis", "pay"],
  // Supervisor — tech mobile + dispatch oversight + comms
  supervisor: ["tech", "now", "dispatch", "customer", "team", "phone", "sms", "jarvis", "pay"],
  // Technician — field essentials only
  tech:       ["tech", "phone", "sms", "team", "pay"],
  // Installer — most restricted
  installer:  ["tech", "team", "pay"],
};

const FALLBACK = ROLE_DEFAULTS.office;

export function getRoleDefaults(role: string | null | undefined): string[] {
  if (!role) return FALLBACK;
  const key = role.toLowerCase() as RoleKey;
  return ROLE_DEFAULTS[key] ?? FALLBACK;
}

/** True if the given allowed_tabs match the role's defaults exactly (order-insensitive). */
export function matchesRoleDefaults(role: string | null | undefined, tabs: string[] | null | undefined): boolean {
  if (!tabs) return false;
  const defaults = getRoleDefaults(role);
  if (tabs.length !== defaults.length) return false;
  const set = new Set(tabs);
  return defaults.every(t => set.has(t));
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Admin",
  office: "Office",
  supervisor: "Supervisor",
  tech: "Technician",
  installer: "Installer",
};
