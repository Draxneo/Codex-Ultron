/**
 * TechLayout.tsx — Mobile layout for tech/supervisor roles
 *
 * Tech tabs: My Jobs, Phone, SMS, Pay
 * Backlog stays out of field bottom navigation.
 */

import { Briefcase, Phone, MessageSquare, DollarSign, Users, Bot, Settings } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";

/** Tab key used for filtering via employee_tab_access */
const TAB_KEY_MAP: Record<string, string> = {
  "/tech": "jobs",
  "/jobs/backlog": "jobs",
  "/phone": "phone",
  "/tech/sms": "sms",
  "/tech/customers": "customers",
  "/copilot": "copilot",
  "/pay": "pay",
  "/admin": "admin",
};

function useTechTabs(): MobileTab[] {
  const allowedTabs = useEmployeeTabAccess();

  const allTabs: MobileTab[] = [
    {
      path: "/tech",
      icon: Briefcase,
      label: "My Jobs",
      match: (p: string) => p === "/tech" || p === "/" || p.startsWith("/form/"),
    },
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
    ...(allowedTabs?.has("customers") ? [{
      path: "/tech/customers",
      icon: Users,
      label: "Customers",
      match: (p: string) => p.startsWith("/tech/customers"),
    } as MobileTab] : []),
    ...(allowedTabs?.has("copilot") ? [{
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
