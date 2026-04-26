/**
 * roleAccessDefaults.ts — Single source of truth for role → page-access defaults.
 *
 * Mirrors the `get_role_default_tabs(role)` SQL function. Keep these in sync.
 */

export type RoleKey = "admin" | "office" | "supervisor" | "tech" | "installer";

export const ROLE_DEFAULTS: Record<RoleKey, string[]> = {
  admin:      ["jobs", "phone", "sms", "inbox", "customers", "vendors", "copilot", "pay", "admin"],
  office:     ["jobs", "phone", "sms", "inbox", "customers", "vendors", "copilot", "pay"],
  supervisor: ["jobs", "phone", "sms", "customers", "copilot", "pay"],
  tech:       ["jobs", "phone", "sms", "pay"],
  installer:  ["jobs", "pay"],
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
