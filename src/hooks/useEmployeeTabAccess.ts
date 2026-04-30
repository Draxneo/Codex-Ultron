/**
 * useEmployeeTabAccess.ts — Fetches allowed page-access keys for the current employee.
 *
 * Resolution order:
 *   1. If a row exists in `employee_tab_access` → use those tabs
 *   2. Otherwise → fall back to the role's defaults from ROLE_DEFAULTS
 *   3. If no employee/role → null (show everything as last-resort safety)
 *
 * Also exports `routeToTabKey` so ProtectedRoute and AppHeader can map
 * a pathname to the corresponding access key.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { getRoleDefaults } from "@/lib/roleAccessDefaults";

/** Map a pathname to its access-control key. Returns undefined for unknown routes. */
export function routeToTabKey(pathname: string, search?: string): string | undefined {
  if (
    pathname === "/" ||
    pathname.startsWith("/intake") ||
    pathname.startsWith("/now") ||
    pathname.startsWith("/dispatch") ||
    pathname.startsWith("/operations-v2") ||
    pathname.startsWith("/dispatch-v2") ||
    pathname.startsWith("/schedule-v2") ||
    pathname.startsWith("/workflows") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/records/") ||
    pathname === "/tech" ||
    pathname.startsWith("/tech/jobs") ||
    pathname.startsWith("/estimates") ||
    pathname.startsWith("/form/")
  ) return "jobs";
  if (pathname.startsWith("/tech/customers")) return "jobs";
  // Legacy /inbox links redirect into the split Phone/SMS pages.
  if (pathname.startsWith("/inbox")) {
    if (search?.includes("sms")) return "sms";
    if (search?.includes("calls")) return "phone";
    if (search?.includes("voicemail")) return "phone";
    return "sms";
  }
  if (pathname.startsWith("/calls")) return "phone";
  if (pathname.startsWith("/phone")) return "phone";
  if (pathname.startsWith("/phone-console")) return "phone";
  if (pathname.startsWith("/sms")) return "sms";
  if (pathname.startsWith("/team")) return "chat";
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/agreements") || pathname.startsWith("/leads")) return "customers";
  if (pathname.startsWith("/vendors") || pathname.startsWith("/locations")) return "jobs";
  if (pathname.startsWith("/copilot")) return "copilot";
  if (pathname.startsWith("/catalog") || pathname.startsWith("/repair-catalog") || pathname.startsWith("/shopping-cart")) return "jobs";
  if (pathname.startsWith("/payments")) return "pay";
  if (pathname.startsWith("/reports")) return "admin";
  if (pathname.startsWith("/pay")) return "pay";
  if (pathname.startsWith("/admin") && search?.includes("section=employees") && search?.includes("employeeTab=pay")) return "pay";
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/agent-training") ||
    pathname.startsWith("/ivr-builder") ||
    pathname.startsWith("/system-log")
  ) return "admin";
  if (pathname.startsWith("/quick-quote")) return "jobs";
  return undefined;
}

/** All recognised access keys in display order */
export const ALL_ACCESS_KEYS = [
  "jobs", "phone", "sms", "inbox", "chat",
  "customers", "copilot", "pay", "admin",
] as const;

const ACCESS_FALLBACK_ROUTE: Record<(typeof ALL_ACCESS_KEYS)[number], string> = {
  jobs: "/dispatch",
  phone: "/phone",
  sms: "/sms",
  inbox: "/sms",
  chat: "/team",
  customers: "/customers",
  copilot: "/copilot",
  pay: "/admin?section=employees&employeeTab=pay",
  admin: "/admin",
};

export function getFirstAllowedRoute(allowedTabs: Set<string> | null, role?: string | null): string {
  const isFieldRole = role === "tech" || role === "supervisor" || role === "installer";

  if (!allowedTabs || allowedTabs.size === 0) {
    return isFieldRole ? "/tech" : "/dispatch";
  }

  for (const key of ALL_ACCESS_KEYS) {
    if (!allowedTabs.has(key)) continue;
    if (key === "jobs" && isFieldRole) return "/tech";
    return ACCESS_FALLBACK_ROUTE[key];
  }

  return isFieldRole ? "/tech" : "/dispatch";
}

export function useEmployeeTabAccess(): Set<string> | null {
  const { employeeId, role, loading } = useEffectiveAuth();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["employee_tab_access", employeeId],
    enabled: !!employeeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_tab_access")
        .select("allowed_tabs")
        .eq("employee_id", employeeId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.allowed_tabs as string[] | undefined) ?? null;
    },
  });

  // Keep access unresolved while auth or employee-specific access is still loading.
  // This prevents premature fallback-to-role defaults, which can redirect users away
  // from pages they actually still have access to via employee_tab_access.
  if (loading) return null;
  if (employeeId && (isLoading || isFetching) && data === undefined) return null;

  // Row exists → use it
  if (data && data.length > 0) return new Set(data);

  // Query failed → fall back to role defaults instead of crashing route gating.
  if (error && role) return new Set(getRoleDefaults(role));

  // No row → fall back to role defaults (no more silent "show everything")
  if (role) return new Set(getRoleDefaults(role));

  // No role yet (still loading) → null = show everything as safety
  return null;
}
