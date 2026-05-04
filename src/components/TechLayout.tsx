/**
 * TechLayout.tsx — Mobile layout for tech/supervisor roles
 *
 * Tech tabs: My Jobs, Phone, SMS, Pay
 * Backlog stays out of field bottom navigation.
 */

import { Briefcase, Phone, MessageSquare, DollarSign, Users, Bot, Settings, MapPinned } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

/**
 * Tab key used for filtering bottom-nav tabs via employee_tab_access.
 * Updated 2026-05-03 to align with the redesigned 12-key vocabulary
 * (see roleAccessDefaults.ts and useEmployeeTabAccess.routeToTabKey).
 */
const TAB_KEY_MAP: Record<string, string> = {
  "/tech": "tech",
  "/tech/team-schedule": "tech",
  "/jobs/backlog": "tech",
  "/phone": "phone",
  "/tech/sms": "sms",
  "/tech/customers": "customer",
  "/copilot": "jarvis",
  "/pay": "pay",
  "/admin": "admin",
};

function useTechTabs(): MobileTab[] {
  const allowedTabs = useEmployeeTabAccess();
  const { role } = useEffectiveAuth();
  const canViewTeamSchedule = role === "supervisor" || role === "admin";

  const allTabs: MobileTab[] = [
    {
      path: "/tech",
      icon: Briefcase,
      label: "My Jobs",
      match: (p: string) => p === "/tech" || p === "/" || p.startsWith("/form/"),
    },
    ...(canViewTeamSchedule ? [{
      path: "/tech/team-schedule",
      icon: MapPinned,
      label: "Team",
      match: (p: string) => p.startsWith("/tech/team-schedule"),
    } as MobileTab] : []),
    {
      path: "/phone",
      icon: Phone,
      label: "Phone",
      match: (p: string) => p.startsWith("/phone") || p.startsWith("/calls") || (p.includes("/inbox") && p.includes("calls")),
    },
    {
      path: "/tech/sms",
      icon: MessageSquare,
      label: "SMS",
      match: (p: string) => p.startsWith("/tech/sms"),
    },
    ...(allowedTabs?.has("customer") ? [{
      path: "/tech/customers",
      icon: Users,
      label: "Customer",
      match: (p: string) => p.startsWith("/tech/customers"),
    } as MobileTab] : []),
    ...(allowedTabs?.has("jarvis") ? [{
      path: "/copilot",
      icon: Bot,
      label: "JARVIS",
      match: (p: string) => p.startsWith("/copilot"),
    } as MobileTab] : []),
    {
      path: "/pay",
      icon: DollarSign,
      label: "Pay",
      match: (p: string) => p.startsWith("/pay"),
    },
    ...(allowedTabs?.has("admin") ? [{
      path: "/admin",
      icon: Settings,
      label: "Admin",
      match: (p: string) => p.startsWith("/admin"),
    } as MobileTab] : []),
  ];

  if (!allowedTabs) return allTabs;
  return allTabs.filter(t => allowedTabs.has(TAB_KEY_MAP[t.path] ?? ""));
}

export function TechLayout({ children }: { children: React.ReactNode }) {
  const tabs = useTechTabs();
  return <MobileShell tabs={tabs}>{children}</MobileShell>;
}
