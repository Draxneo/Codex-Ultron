/**
 * TechLayout.tsx — Mobile layout for tech/supervisor roles
 *
 * Tech tabs: My Jobs, Phone, SMS, Pay
 * Supervisor adds: Backlog tab for unscheduled jobs
 */

import { Briefcase, Phone, MessageSquare, DollarSign, CalendarOff, Users, Bot, Settings } from "lucide-react";
import { MobileShell, type MobileTab } from "@/components/MobileShell";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useBacklogJobs } from "@/hooks/useJobs";

/** Tab key used for filtering via employee_tab_access */
const TAB_KEY_MAP: Record<string, string> = {
  "/tech": "jobs",
  "/jobs/backlog": "jobs",
  "/phone": "phone",
  "/sms": "sms",
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
