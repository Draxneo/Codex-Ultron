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

/**
 * Map a pathname to its access-control key. Returns undefined for unknown routes.
 *
 * 2026-05-03 redesign: each Operating HQ has its own key (intake/now/dispatch/
 * tech/quote/customer/team) plus utility keys (phone/sms/jarvis/pay/admin).
 * Old keys (jobs/inbox/chat/customers/copilot/vendors) were retired.
 */
export function routeToTabKey(pathname: string, search?: string): string | undefined {
  // Tech HQ (mobile schedule + tools) — only the literal /tech and its tech-specific subroutes
  if (
    pathname === "/tech" ||
    pathname.startsWith("/tech/team-schedule") ||
    pathname.startsWith("/tech/jobs") ||
    pathname.startsWith("/jobs/backlog") ||
    pathname.startsWith("/form/")
  ) return "tech";
  if (pathname.startsWith("/tech/sms")) return "sms";
  if (pathname.startsWith("/tech/customers")) return "customer";

  // Intake HQ (Operations Desk)
  if (pathname.startsWith("/intake") || pathname.startsWith("/operations-v2")) return "intake";

  // Now HQ (live job activity board)
  if (pathname.startsWith("/now")) return "now";

  // Dispatch HQ (schedule board)
  if (
    pathname.startsWith("/dispatch") ||
    pathname.startsWith("/dispatch-v2") ||
    pathname.startsWith("/schedule-v2") ||
    pathname.startsWith("/workflows") ||
    pathname.startsWith("/records/") ||
    pathname.startsWith("/jobs") // /jobs landing → dispatch (specific subroutes match higher above)
  ) return "dispatch";

  // Quote HQ (catalog + builder + estimates)
  if (
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/repair-catalog") ||
    pathname.startsWith("/shopping-cart") ||
    pathname.startsWith("/quick-quote") ||
    pathname.startsWith("/quote-builder") ||
    pathname.startsWith("/estimates")
  ) return "quote";

  // Customer HQ
  if (
    pathname.startsWith("/customers") ||
    pathname.startsWith("/agreements") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/vendors") ||
    pathname.startsWith("/locations")
  ) return "customer";

  // Team HQ (chat)
  if (pathname.startsWith("/team")) return "team";

  // Phone surface
  if (
    pathname.startsWith("/phone") ||
    pathname.startsWith("/phone-console") ||
    pathname.startsWith("/calls") ||
    pathname.startsWith("/communications")
  ) return "phone";

  // SMS surface
  if (pathname.startsWith("/sms")) return "sms";

  // Legacy /inbox redirects — split by query string into phone or sms
  if (pathname.startsWith("/inbox")) {
    if (search?.includes("calls") || search?.includes("voicemail")) return "phone";
    return "sms";
  }

  // JARVIS (Copilot)
  if (pathname.startsWith("/copilot")) return "jarvis";

  // Pay (employee pay page)
  if (pathname.startsWith("/pay")) return "pay";
  if (pathname.startsWith("/admin") && search?.includes("section=employees") && search?.includes("employeeTab=pay")) return "pay";

  // Admin (settings, payments, reports, agent training, IVR builder, system log)
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/agent-training") ||
    pathname.startsWith("/ivr-builder") ||
    pathname.startsWith("/system-log")
  ) return "admin";

  // Root path — let the role-aware home handle routing, no key check
  if (pathname === "/") return undefined;

  return undefined;
}

/** All recognised access keys in display order (left → right in the matrix UI) */
export const ALL_ACCESS_KEYS = [
  "tech", "intake", "now", "dispatch", "quote", "customer", "team",
  "phone", "sms", "jarvis", "pay", "admin",
] as const;

/**
 * Default landing route for each access key. Used by getFirstAllowedRoute()
 * to send a user to a page they actually have access to after login.
 */
const ACCESS_FALLBACK_ROUTE: Record<(typeof ALL_ACCESS_KEYS)[number], string> = {
  tech: "/tech",
  intake: "/intake",
  now: "/now",
  dispatch: "/dispatch",
  quote: "/catalog",
  customer: "/customers",
  team: "/team",
  phone: "/phone",
  sms: "/sms",
  jarvis: "/copilot",
  pay: "/pay",
  admin: "/admin",
};

export function getFirstAllowedRoute(allowedTabs: Set<string> | null, role?: string | null): string {
  const isFieldRole = role === "tech" || role === "supervisor" || role === "installer";

  if (!allowedTabs || allowedTabs.size === 0) {
    return isFieldRole ? "/tech" : "/dispatch";
  }

  // Field roles always prefer /tech if they have it
  if (isFieldRole && allowedTabs.has("tech")) return "/tech";

  // Office/admin roles SKIP the "tech" key when picking a default landing —
  // they have it for completeness (so they can navigate to /tech if needed)
  // but their natural home is /dispatch or /communications, not the tech
  // mobile schedule. Without this skip, my 2026-05-03 permissions reorder
  // would land every admin on /tech because tech is first in ALL_ACCESS_KEYS.
  for (const key of ALL_ACCESS_KEYS) {
    if (key === "tech" && !isFieldRole) continue;
    if (allowedTabs.has(key)) return ACCESS_FALLBACK_ROUTE[key];
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
