import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import logo from "@/assets/logo.png";
import { PhoneForwarded, MessageCircle, Bot, LogOut, Settings, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess, routeToTabKey } from "@/hooks/useEmployeeTabAccess";
import { useNavOrder } from "@/hooks/useNavOrder";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";

import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { NewItemDropdown } from "@/components/NewItemDropdown";
import { AdminToolsGrid } from "@/components/AdminToolsGrid";
import { ApiCostAlertBanner } from "@/components/ApiCostAlertBanner";
import { SystemStatusIndicator } from "@/components/SystemStatusIndicator";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";

const allNavItems: Record<string, { label: string; roles: string[] | null }> = {
  "/": { label: "Schedule", roles: null },
  "/inbox": { label: "Inbox", roles: null },
  "/customers": { label: "Customers", roles: null },
  "/vendors": { label: "Vendors", roles: null },
  "/copilot": { label: "JARVIS", roles: null },
  "/pay": { label: "Pay", roles: null },
  "/admin": { label: "Admin", roles: null },
  "/quick-quote": { label: "Quick Quote", roles: null },
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
  const { settings, isLoading: settingsLoading, updateSettings } = useCompanySettings();
  const [fwdNumber, setFwdNumber] = useState("");
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  useEffect(() => {
    if (!settingsLoading && settings.call_forwarding_number) {
      setFwdNumber(settings.call_forwarding_number);
    }
  }, [settingsLoading, settings.call_forwarding_number]);
  const unreadSms = useUnreadSmsCount();
  const { unreadCount: unreadVoicemails } = useVoicemails();

  const totalInboxUnread = unreadSms + unreadVoicemails;

  const unreadMap: Record<string, number> = {
    "/inbox": totalInboxUnread,
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

  const adminSubRoutes = ["/parts", "/payments", "/agent-training", "/brochure", "/settings", "/agreements"];

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

            {/* Forward/SMS popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground relative">
                  <PhoneForwarded className="h-4.5 w-4.5" />
                  {(settings.call_forwarding_enabled === "true" || settings.sms_alert_enabled === "true") && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="fwd-toggle" className="text-sm font-medium">Forward calls</Label>
                      </div>
                      <Switch id="fwd-toggle" checked={settings.call_forwarding_enabled === "true"}
                        onCheckedChange={(checked) => updateSettings.mutate({ call_forwarding_enabled: checked ? "true" : "false" })} />
                    </div>
                    {settings.call_forwarding_enabled === "true" && (
                      <p className="text-xs text-amber-600 font-medium ml-6">Calls are forwarding to cell, so the softphone will not ring.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="sms-alert-toggle" className="text-sm font-medium">SMS alerts to cell</Label>
                      </div>
                      <Switch id="sms-alert-toggle" checked={settings.sms_alert_enabled === "true"}
                        onCheckedChange={(checked) => updateSettings.mutate({ sms_alert_enabled: checked ? "true" : "false" })} />
                    </div>
                    {settings.sms_alert_enabled === "true" && (
                      <p className="text-xs text-emerald-600 font-medium ml-6">Inbound customer texts are forwarded to cell.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="ai-draft-toggle" className="text-sm font-medium">AI auto-draft replies</Label>
                      </div>
                      <Switch id="ai-draft-toggle" checked={settings.ai_sms_auto_draft !== "false"}
                        onCheckedChange={(checked) => updateSettings.mutate({ ai_sms_auto_draft: checked ? "true" : "false" })} />
                    </div>
                    {settings.ai_sms_auto_draft === "false" && (
                      <p className="text-xs text-muted-foreground font-medium ml-6">JARVIS will not draft SMS replies.</p>
                    )}
                  </div>
                  <div className="space-y-1 border-t pt-3">
                    <Label htmlFor="fwd-number" className="text-xs text-muted-foreground">Cell number</Label>
                    <Input id="fwd-number" type="tel" value={fwdNumber}
                      onChange={(e) => setFwdNumber(e.target.value)}
                      onBlur={() => { if (fwdNumber !== settings.call_forwarding_number) updateSettings.mutate({ call_forwarding_number: fwdNumber }); }}
                      className="h-9 text-sm" placeholder="+12105551234" />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <AdminToolsGrid />
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
