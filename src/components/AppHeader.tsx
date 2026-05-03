import { Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/logo.png";
import { LogOut, Settings, Moon, Sun, PhoneCall, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployeeTabAccess, routeToTabKey } from "@/hooks/useEmployeeTabAccess";
import { useNavOrder } from "@/hooks/useNavOrder";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useHeadquartersBadges } from "@/hooks/useHeadquartersBadges";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { NewItemDropdown } from "@/components/NewItemDropdown";
import { AdminToolsGrid } from "@/components/AdminToolsGrid";
import { ViewAsTechTester } from "@/components/ViewAsTechTester";
import { ApiCostAlertBanner } from "@/components/ApiCostAlertBanner";
import { SystemStatusIndicator } from "@/components/SystemStatusIndicator";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { toast } from "@/hooks/use-toast";

const allNavItems: Record<string, { label: string; roles: string[] | null }> = {
  "/intake": { label: "Intake HQ", roles: null },
  "/now": { label: "Now HQ", roles: null },
  "/dispatch": { label: "Dispatch HQ", roles: null },
  "/phone": { label: "Inbox", roles: null },
  "/sms": { label: "Messages", roles: null },
  "/team": { label: "Team HQ", roles: null },
  "/customers": { label: "Customer HQ", roles: null },
  "/quick-quote": { label: "Quote HQ", roles: null },
  "/catalog": { label: "Price Book", roles: null },
  "/payments": { label: "Payments", roles: null },
  "/reports": { label: "Reporting", roles: null },
  "/copilot": { label: "JARVIS", roles: null },
  "/admin": { label: "Settings", roles: null },
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

type AppHeaderProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

export function AppHeader({ searchValue, onSearchChange, searchPlaceholder }: AppHeaderProps = {}) {
  const location = useLocation();
  const { role, signOut, user, employeeId } = useEffectiveAuth();
  const queryClient = useQueryClient();
  const allowedTabs = useEmployeeTabAccess();
  const { order } = useNavOrder();
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: unreadVoicemails } = useVoicemails();
  const headquartersBadges = useHeadquartersBadges();

  const { data: desktopCallsEnabled = false } = useQuery({
    queryKey: ["employee-desktop-calls", employeeId],
    enabled: Boolean(user && employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("desktop_calls_enabled")
        .eq("id", employeeId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.desktop_calls_enabled);
    },
  });

  const desktopCallsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!employeeId) throw new Error("No employee profile is linked to this login.");
      const { error } = await supabase
        .from("employees")
        .update({ desktop_calls_enabled: enabled })
        .eq("id", employeeId);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["employee-desktop-calls", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees-for-routing"] });
      if (enabled) {
        openPhoneConsole();
        toast({
          title: "Desktop calls on",
          description: "Keep the phone popup open so Twilio can ring this computer.",
        });
      } else {
        toast({
          title: "Desktop calls off",
          description: "Incoming calls will follow the normal IVR and cell-forwarding path.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't update call routing",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const unreadMap: Record<string, number> = {
    ...headquartersBadges,
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 text-foreground shadow-sm backdrop-blur">
      <div className="flex h-[52px] items-center gap-2 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mr-3 shrink-0 rounded-md px-1 py-1 hover:bg-muted/50">
          <img src={logo} alt={companyName} className="h-8 w-8 rounded bg-white p-0.5 shadow-sm" />
          <span className="hidden max-w-[210px] truncate text-sm font-semibold tracking-tight text-foreground xl:inline">{companyName}</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {navItems.map((item) => {
            const active = item.to === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/jobs")
              : item.to === "/intake"
                ? location.pathname === "/intake" || location.pathname.startsWith("/operations-v2")
              : item.to === "/dispatch"
                ? location.pathname === "/dispatch" || location.pathname.startsWith("/dispatch/") || location.pathname.startsWith("/dispatch-v2") || location.pathname.startsWith("/schedule-v2")
              : item.to === "/phone"
                ? location.pathname.startsWith("/phone") || location.pathname.startsWith("/calls") || location.pathname.startsWith("/inbox")
              : item.to === "/quick-quote"
                ? location.pathname.startsWith("/quick-quote") || location.pathname.startsWith("/quote-builder") || location.pathname.startsWith("/estimates")
              : location.pathname.startsWith(item.to);
            const unread = unreadMap[item.to] || 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative rounded-md border border-transparent px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-border bg-secondary text-primary font-semibold shadow-[inset_0_-2px_0_hsl(var(--accent))]"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {item.label}
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        {user && (
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <SmartSearchBar value={searchValue} onChange={onSearchChange} placeholder={searchPlaceholder} />
            <NewItemDropdown />
            {employeeId && (
              <div
                className={cn(
                  "hidden h-9 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold xl:flex",
                  desktopCallsEnabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
                title="When on, IVR calls assigned to you can ring this desktop softphone."
              >
                <MonitorSmartphone className="h-4 w-4" />
                <span>Desk calls</span>
                <Switch
                  checked={desktopCallsEnabled}
                  disabled={desktopCallsMutation.isPending}
                  onCheckedChange={(checked) => desktopCallsMutation.mutate(checked)}
                  aria-label="Take calls on desktop"
                  className="scale-75"
                />
              </div>
            )}
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
