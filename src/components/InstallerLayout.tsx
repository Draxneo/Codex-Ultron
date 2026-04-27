/**
 * InstallerLayout.tsx — Minimal mobile layout for install crews
 *
 * 3 tabs: My Job, Phone, SMS
 * Filtered by employee_tab_access checkmarks.
 */

import { Wrench, Phone, MessageSquare, Users, Bot, DollarSign, Settings, Inbox } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";

const TAB_KEY_MAP: Record<string, string> = {
  "/": "jobs",
  "/inbox?section=calls": "phone",
  "/inbox?section=sms": "sms",
  "/inbox": "inbox",
  "/customers": "customers",
  "/copilot": "copilot",
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
      path: "/inbox?section=calls",
      icon: Phone,
      label: "Phone",
      match: (p: string) => (p.includes("/inbox") && p.includes("calls")) || p.startsWith("/calls"),
      badge: () => missedCalls,
    },
    {
      path: "/inbox?section=sms",
      icon: MessageSquare,
      label: "SMS",
      match: (p: string) => (p.includes("/inbox") && p.includes("sms")) || p.startsWith("/sms"),
      badge: () => unreadSms,
    },
    ...(allowedTabs?.has("inbox") ? [{
      path: "/inbox",
      icon: Inbox,
      label: "Inbox",
      match: (p: string) => p.startsWith("/inbox") && !p.includes("section=calls") && !p.includes("section=sms"),
    } as MobileTab] : []),
    ...(allowedTabs?.has("customers") ? [{
      path: "/customers",
      icon: Users,
      label: "CRM",
      match: (p: string) => p.startsWith("/customers"),
    } as MobileTab] : []),
    ...(allowedTabs?.has("copilot") ? [{
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
