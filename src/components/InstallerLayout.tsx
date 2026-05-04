/**
 * InstallerLayout.tsx — Minimal mobile layout for install crews
 *
 * 3 tabs: My Job, Phone, SMS
 * Filtered by employee_tab_access checkmarks.
 */

import { Wrench, Phone, MessageSquare, Users, Bot, DollarSign, Settings } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";

/**
 * Tab key used for filtering bottom-nav tabs via employee_tab_access.
 * Updated 2026-05-03 to align with the redesigned 12-key vocabulary.
 * Installer "My Job" landing maps to the "tech" key (their tech mobile view).
 */
const TAB_KEY_MAP: Record<string, string> = {
  "/": "tech",
  "/phone": "phone",
  "/sms": "sms",
  "/customers": "customer",
  "/copilot": "jarvis",
  "/pay": "pay",
  "/admin": "admin",
};

function useInstallerTabs(): MobileTab[] {
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: missedCalls } = useVoicemails();
  const allowedTabs = useEmployeeTabAccess();

  const allTabs: MobileTab[] = [
    {
      path: "/",
      icon: Wrench,
      label: "My Job",
      match: (p: string) => p === "/" || p.startsWith("/jobs") || p.startsWith("/form/"),
    },
    {
      path: "/phone",
      icon: Phone,
      label: "Phone",
      match: (p: string) => p.startsWith("/phone") || p.startsWith("/calls") || (p.includes("/inbox") && p.includes("calls")),
      badge: () => missedCalls,
    },
    {
      path: "/sms",
      icon: MessageSquare,
      label: "SMS",
      match: (p: string) => p.startsWith("/sms") || (p.includes("/inbox") && p.includes("sms")),
      badge: () => unreadSms,
    },
    ...(allowedTabs?.has("customer") ? [{
      path: "/customers",
      icon: Users,
      label: "Customer",
      match: (p: string) => p.startsWith("/customers"),
    } as MobileTab] : []),
    ...(allowedTabs?.has("jarvis") ? [{
      path: "/copilot",
      icon: Bot,
      label: "JARVIS",
      match: (p: string) => p.startsWith("/copilot"),
    } as MobileTab] : []),
    ...(allowedTabs?.has("pay") ? [{
      path: "/pay",
      icon: DollarSign,
      label: "Pay",
      match: (p: string) => p.startsWith("/pay"),
    } as MobileTab] : []),
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

export function InstallerLayout({ children }: { children: React.ReactNode }) {
  const tabs = useInstallerTabs();
  return <MobileShell tabs={tabs}>{children}</MobileShell>;
}
