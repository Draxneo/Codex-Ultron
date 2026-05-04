/**
 * DispatcherLayout.tsx — Mobile/tablet layout for office users WITHOUT admin access
 *
 * 5 tabs: Dispatch, Phone, SMS, CRM, JARVIS
 * Filtered by employee_tab_access checkmarks.
 */

import { Home, Phone, MessageSquare, Users, Bot } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";

/**
 * Tab key used for filtering bottom-nav tabs via employee_tab_access.
 * Updated 2026-05-03 to align with the redesigned 12-key vocabulary.
 * The "Dispatch" tab on this mobile shell is technically the office-side
 * landing — it maps to the "dispatch" key (Schedule HQ).
 */
const TAB_KEY_MAP: Record<string, string> = {
  "/": "dispatch",
  "/phone": "phone",
  "/sms": "sms",
  "/customers": "customer",
  "/copilot": "jarvis",
};

function useDispatcherTabs(): MobileTab[] {
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: missedCalls } = useVoicemails();
  const allowedTabs = useEmployeeTabAccess();

  const allTabs: MobileTab[] = [
    {
      path: "/",
      icon: Home,
      label: "Dispatch",
      match: (p: string) => p === "/" || p.startsWith("/jobs"),
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
    {
      path: "/customers",
      icon: Users,
      label: "CRM",
      match: (p: string) => p.startsWith("/customers"),
    },
    {
      path: "/copilot",
      icon: Bot,
      label: "JARVIS",
      match: (p: string) => p.startsWith("/copilot"),
    },
  ];

  if (!allowedTabs) return allTabs;
  return allTabs.filter(t => allowedTabs.has(TAB_KEY_MAP[t.path] ?? ""));
}

export function DispatcherLayout({ children }: { children: React.ReactNode }) {
  const tabs = useDispatcherTabs();
  return <MobileShell tabs={tabs}>{children}</MobileShell>;
}
