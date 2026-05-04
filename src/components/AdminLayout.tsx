/**
 * AdminLayout.tsx — Mobile layout for admin/office roles
 *
 * Tabs: Dispatch, Phone, SMS, Customers, Admin Hub
 * Includes unread badges on SMS and missed calls on Phone.
 */

import { Home, Phone, MessageSquare, Users, Settings, MessagesSquare } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

/**
 * Tab key used for filtering bottom-nav tabs via employee_tab_access.
 * Updated 2026-05-03 to align with the redesigned 12-key vocabulary.
 * The admin "Dispatch" tab maps to the dispatch HQ key; CRM uses customer.
 */
const TAB_KEY_MAP: Record<string, string> = {
  "/": "dispatch",
  "/communications": "phone",
  "/phone": "phone",
  "/sms": "sms",
  "/customers": "customer",
  "/admin": "admin",
};

function useAdminTabs(): MobileTab[] {
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: missedCalls } = useVoicemails();
  const allowedTabs = useEmployeeTabAccess();
  const { role } = useEffectiveAuth();
  const adminCleanComms = role === "admin";

  const allTabs: MobileTab[] = [
    {
      path: "/",
      icon: Home,
      label: "Dispatch",
      match: (p: string) => p === "/" || p.startsWith("/jobs"),
    },
    ...(adminCleanComms ? [{
      path: "/communications",
      icon: MessagesSquare,
      label: "Comms",
      match: (p: string) => p.startsWith("/communications"),
      badge: () => unreadSms + missedCalls,
    } as MobileTab] : [{
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
    }] as MobileTab[]),
    {
      path: "/customers",
      icon: Users,
      label: "CRM",
      match: (p: string) => p.startsWith("/customers"),
    },
    {
      path: "/admin",
      icon: Settings,
      label: "Admin",
      match: (p: string) => p.startsWith("/admin"),
    },
  ];

  if (!allowedTabs) return allTabs;
  return allTabs.filter(t => allowedTabs.has(TAB_KEY_MAP[t.path] ?? ""));
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const tabs = useAdminTabs();
  return <MobileShell tabs={tabs}>{children}</MobileShell>;
}
