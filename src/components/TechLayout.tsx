/**
 * TechLayout.tsx — Mobile layout for tech/supervisor roles
 *
 * Tech tabs: My Jobs, Phone, SMS, Pay
 * Supervisor adds: Backlog tab for unscheduled jobs
 */

import { Briefcase, Phone, MessageSquare, DollarSign, CalendarOff, Users, Bot, Settings, Inbox } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useBacklogJobs } from "@/hooks/useJobs";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

/** Tab key used for filtering via employee_tab_access */
const TAB_KEY_MAP: Record<string, string> = {
  "/tech": "jobs",
  "/jobs/backlog": "jobs",
  "/inbox?section=calls": "phone",
  "/inbox?section=sms": "sms",
  "/inbox": "inbox",
  "/customers": "customers",
  "/copilot": "copilot",
  "/pay": "pay",
  "/admin": "admin",
};

function useTechTabs(): MobileTab[] {
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: missedCalls } = useVoicemails();
  const allowedTabs = useEmployeeTabAccess();
  const { role } = useEffectiveAuth();
  const { data: buckets } = useBacklogJobs();
  const telephony = useTelephonyMode();
  const hidePhoneTabs = telephony.isHandoff;

  const isSupervisor = role === "supervisor";

  const backlogCount = buckets
    ? (buckets.readyToSchedule?.length || 0) + (buckets.waitingOnParts?.length || 0) + (buckets.followUp?.length || 0)
    : 0;

  const allTabs: MobileTab[] = [
    {
      path: "/tech",
      icon: Briefcase,
      label: "My Jobs",
      match: (p: string) => p === "/tech" || p === "/" || p.startsWith("/form/"),
    },
    ...(isSupervisor ? [{
      path: "/jobs/backlog",
      icon: CalendarOff,
      label: "Backlog",
      match: (p: string) => p.startsWith("/jobs/backlog"),
      badge: () => backlogCount,
    } as MobileTab] : []),
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
