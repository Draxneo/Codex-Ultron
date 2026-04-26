/**
 * AdminLayout.tsx — Mobile layout for admin/office roles
 *
 * Tabs: Dispatch, Phone, SMS, Customers, Admin Hub
 * Includes unread badges on SMS and missed calls on Phone.
 */

import { Home, Phone, MessageSquare, Users, Settings } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

const TAB_KEY_MAP: Record<string, string> = {
  "/": "jobs",
  "/inbox?section=calls": "phone",
  "/inbox?section=sms": "sms",
  "/customers": "customers",
  "/admin": "admin",
};

function useAdminTabs(): MobileTab[] {
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: missedCalls } = useVoicemails();
  const allowedTabs = useEmployeeTabAccess();
  const telephony = useTelephonyMode();
  const hidePhoneTabs = telephony.isHandoff;

  const allTabs: MobileTab[] = [
    {
      path: "/",
      icon: Home,
      label: "Dispatch",
      match: (p: string) => p === "/" || p.startsWith("/jobs"),
    },
    ...(hidePhoneTabs ? [] : [
      {
        path: "/inbox?section=calls",
        icon: Phone,
        label: "Phone",
        match: (p: string) => p.includes("/inbox") && p.includes("calls") || p.startsWith("/calls"),
        badge: () => missedCalls,
      } as MobileTab,
      {
        path: "/inbox?section=sms",
        icon: MessageSquare,
        label: "SMS",
        match: (p: string) => p.includes("/inbox") && p.includes("sms") || p.startsWith("/sms"),
        badge: () => unreadSms,
      } as MobileTab,
    ]),
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
