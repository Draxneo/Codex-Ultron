import { Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import logo from "@/assets/logo.png";
import { LogOut, Settings, Moon, Sun, PhoneCall } from "lucide-react";
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

const allNavItems: Record<string, { label: string; roles: string[] | null }> = {
  "/": { label: "Schedule", roles: null },
  "/phone": { label: "Phone", roles: null },
  "/sms": { label: "SMS", roles: null },
  "/team": { label: "Team Chat", roles: null },
  "/customers": { label: "Customers", roles: null },
  "/quick-quote": { label: "Estimates", roles: null },
  "/catalog": { label: "Price Book", roles: null },
  "/pay": { label: "Payments", roles: null },
  "/reports": { label: "Reporting", roles: null },
  "/copilot": { label: "JARVIS", roles: null },
  "/admin": { label: "Admin", roles: null },
};

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
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
    <header className="sticky top-0 z-40 bg-card border-b border-border/50 shadow-sm">
      <div className="flex items-center h-12 px-4 gap-1">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mr-4 shrink-0">
          <img src={logo} alt={companyName} className="h-7 w-7 rounded" />
          <span className="text-sm font-bold tracking-tight text-foreground hidden lg:inline">{companyName}</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {navItems.map((item) => {
            const active = item.to === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/jobs") || location.pathname.startsWith("/estimates")
              : item.to === "/phone"
                ? location.pathname.startsWith("/phone") || location.pathname.startsWith("/calls")
              : location.pathname.startsWith(item.to);
            const unread = unreadMap[item.to] || 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative px-2.5 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors",
                  active
                    ? "text-primary font-semibold bg-primary/8"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
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
            <SmartSearchBar />
            <NewItemDropdown />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openPhoneConsole()}
              className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
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
                <Button variant="ghost" size="icon" className={cn("h-9 w-9 text-muted-foreground hover:text-foreground",
                  (location.pathname === "/admin" || adminSubRoutes.some(r => location.pathname.startsWith(r))) && "text-primary bg-primary/8"
                )}>
                  <Settings className="h-4.5 w-4.5" />
                </Button>
              </Link>
            )}

            <Button variant="ghost" size="icon" onClick={signOut} className="h-9 w-9 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4.5 w-4.5" />
            </Button>
          </div>
        )}
      </div>
    </header>
    </>
  );
}
