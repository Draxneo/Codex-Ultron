import { Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import logo from "@/assets/logo.png";
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CreditCard,
  FileText,
  Inbox,
  LogOut,
  MessageSquare,
  Moon,
  PhoneCall,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess, routeToTabKey } from "@/hooks/useEmployeeTabAccess";
import { useNavOrder } from "@/hooks/useNavOrder";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";

import { Button } from "@/components/ui/button";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { NewItemDropdown } from "@/components/NewItemDropdown";
import { AdminToolsGrid } from "@/components/AdminToolsGrid";
import { ViewAsTechTester } from "@/components/ViewAsTechTester";
import { ApiCostAlertBanner } from "@/components/ApiCostAlertBanner";
import { SystemStatusIndicator } from "@/components/SystemStatusIndicator";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";

const allNavItems: Record<string, { label: string; roles: string[] | null; icon: LucideIcon }> = {
  "/": { label: "Schedule", roles: null, icon: CalendarDays },
  "/phone": { label: "Inbox", roles: null, icon: Inbox },
  "/sms": { label: "Messages", roles: null, icon: MessageSquare },
  "/team": { label: "Team Chat", roles: null, icon: MessageSquare },
  "/customers": { label: "Customers", roles: null, icon: Users },
  "/quick-quote": { label: "Estimates", roles: null, icon: FileText },
  "/catalog": { label: "Price Book", roles: null, icon: BookOpen },
  "/pay": { label: "Payments", roles: null, icon: CreditCard },
  "/reports": { label: "Reporting", roles: null, icon: BarChart3 },
  "/copilot": { label: "JARVIS", roles: null, icon: Bot },
  "/admin": { label: "Settings", roles: null, icon: Settings },
};

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9 text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </Button>
  );
}

export function AppHeader() {
  const location = useLocation();
  const { role, signOut, user } = useAuth();
  const allowedTabs = useEmployeeTabAccess();
  const { order } = useNavOrder();
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: unreadVoicemails } = useVoicemails();

  const unreadMap: Record<string, number> = {
    "/phone": unreadVoicemails,
    "/sms": unreadSms,
  };

  const navItems = order
    .filter((path) => {
      const item = allNavItems[path];
      if (!item) return false;
      if (item.roles !== null && (!role || !item.roles.includes(role))) return false;
      if (allowedTabs && role !== "admin") {
        const key = routeToTabKey(path);
        if (key && !allowedTabs.has(key)) return false;
      }
      return true;
    })
    .map((path) => ({ to: path, ...allNavItems[path] }));

  const adminSubRoutes = ["/parts", "/payments", "/catalog", "/leads", "/agent-training", "/brochure", "/settings", "/agreements"];

  return (
    <>
      <ApiCostAlertBanner />
    <header className="sticky top-0 z-40 border-b border-primary/20 bg-primary text-primary-foreground shadow-[0_8px_24px_-18px_hsl(var(--primary))]">
      <div className="flex items-center h-14 px-4 gap-2">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mr-3 shrink-0 rounded-md px-1 py-1 hover:bg-white/10">
          <img src={logo} alt={companyName} className="h-8 w-8 rounded bg-white p-0.5 shadow-sm" />
          <span className="hidden max-w-[210px] truncate text-sm font-bold tracking-tight text-primary-foreground xl:inline">{companyName}</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {navItems.map((item) => {
            const active = item.to === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/jobs")
              : item.to === "/phone"
                ? location.pathname.startsWith("/phone") || location.pathname.startsWith("/calls") || location.pathname.startsWith("/inbox")
              : item.to === "/quick-quote"
                ? location.pathname.startsWith("/quick-quote") || location.pathname.startsWith("/estimates")
              : location.pathname.startsWith(item.to);
            const unread = unreadMap[item.to] || 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-semibold shadow-sm"
                    : "text-primary-foreground/78 hover:bg-white/10 hover:text-primary-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        {user && (
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <div className="rounded-md bg-white/95 text-foreground shadow-sm">
              <SmartSearchBar />
            </div>
            <div className="[&_button]:bg-accent [&_button]:text-accent-foreground [&_button]:hover:bg-accent/90">
              <NewItemDropdown />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openPhoneConsole()}
              className="relative h-9 w-9 text-primary-foreground/75 hover:bg-white/10 hover:text-primary-foreground"
              title="Open dialer"
            >
              <PhoneCall className="h-4.5 w-4.5" />
              {unreadVoicemails > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-4 min-w-[16px] rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                  {unreadVoicemails > 9 ? "9+" : unreadVoicemails}
                </span>
              )}
            </Button>

            <AdminToolsGrid />
            <ViewAsTechTester />
            <SystemStatusIndicator />
            <ThemeToggleButton />

            {/* Settings gear to admin */}
            {role === "admin" && (
              <Link to="/admin">
                <Button variant="ghost" size="icon" className={cn("h-9 w-9 text-primary-foreground/75 hover:bg-white/10 hover:text-primary-foreground",
                  (location.pathname === "/admin" || adminSubRoutes.some(r => location.pathname.startsWith(r))) && "bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground"
                )}>
                  <Settings className="h-4.5 w-4.5" />
                </Button>
              </Link>
            )}

            <Button variant="ghost" size="icon" onClick={signOut} className="h-9 w-9 text-primary-foreground/75 hover:bg-white/10 hover:text-primary-foreground">
              <LogOut className="h-4.5 w-4.5" />
            </Button>
          </div>
        )}
      </div>
    </header>
    </>
  );
}
