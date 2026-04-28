/**
 * AdminHub.tsx - Icon-grid landing page for /admin
 * 
 * Categorized icon grids: Quick Actions, Metrics, Tools & Builders, Settings.
 * Universal layout for desktop (5-col) and mobile (3-col).
 */

import { Link } from "react-router-dom";
import {
  Plus, UserPlus, FileText, Phone, MessageSquare,
  Briefcase, Clock, CheckCircle2, DollarSign,
  Zap, ArrowRight, RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useRecentActivity } from "@/hooks/useActivityLog";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState, useCallback } from "react";
import { TOOL_CARDS, SETTINGS_GROUPS } from "@/config/adminNavigation";

/* Quick Actions */
const quickActions = [
  { label: "New Job", icon: Plus, path: "/?newJob=1", bg: "bg-[hsl(var(--success))]/15", color: "text-[hsl(var(--success))]" },
  { label: "New Customer", icon: UserPlus, path: "/customers?new=1", bg: "bg-[hsl(var(--sky))]/15", color: "text-[hsl(var(--sky))]" },
  { label: "Estimates", icon: FileText, path: "/?type=estimate", bg: "bg-[hsl(var(--warm))]/15", color: "text-[hsl(var(--warm))]" },
  { label: "Phone", icon: Phone, path: "/phone", bg: "bg-primary/10", color: "text-primary" },
  { label: "SMS", icon: MessageSquare, path: "/sms", bg: "bg-[hsl(var(--accent))]/15", color: "text-[hsl(var(--accent))]" },
];

/* Metric Cards Config */
const metricCards = [
  { key: "dispatchedToday" as const, label: "Dispatched", icon: Briefcase, color: "text-[hsl(var(--sky))]", bg: "bg-[hsl(var(--sky))]/10" },
  { key: "totalActive" as const, label: "Active Jobs", icon: Clock, color: "text-[hsl(var(--warm))]", bg: "bg-[hsl(var(--warm))]/10" },
  { key: "completedThisWeek" as const, label: "Done (7d)", icon: CheckCircle2, color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10" },
  { key: "awaitingPayment" as const, label: "Awaiting Pay", icon: DollarSign, color: "text-[hsl(var(--destructive))]", bg: "bg-[hsl(var(--destructive))]/10" },
];

/* Tool cards + settings groups now live in src/config/adminNavigation.ts
 * so the header dropdown (AdminToolsGrid) and this hub stay in sync. */
const toolCards = TOOL_CARDS;
const settingsGroups = SETTINGS_GROUPS;

function IconTile({ icon: Icon, label, color, bg }: { icon: React.ElementType; label: string; color: string; bg: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/60 active:scale-95 transition-all text-center cursor-pointer">
      <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center", bg)}>
        <Icon className={cn("h-5 w-5", color)} />
      </div>
      <span className="text-[11px] font-medium leading-tight text-foreground">{label}</span>
    </div>
  );
}

export function AdminHub({ onNavigateSection }: { onNavigateSection: (section: string) => void }) {
  const { user } = useAuth();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: recentActivity } = useRecentActivity(5);
  const unreadSms = useUnreadSmsCount();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.email?.split("@")[0] ?? "";

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    await queryClient.invalidateQueries({ queryKey: ["recent_activity"] });
    setTimeout(() => setRefreshing(false), 600);
  }, [queryClient]);

  return (
    <div className="animate-fade-in max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">
      {/* ── Hero greeting ─────────────────── */}
      <div className="bg-gradient-to-br from-[hsl(var(--navy))] to-[hsl(var(--navy-dark))] text-primary-foreground px-5 md:px-8 pt-5 pb-6 rounded-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{greeting}</h1>
            <p className="text-primary-foreground/70 text-sm mt-0.5">
              {firstName ? `Welcome back, ${firstName}` : "Here's your overview"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-9 w-9 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {metricCards.map(({ key, label, icon: Icon, color, bg }) => (
            <div
              key={key}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-3.5 flex items-center gap-3"
            >
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", bg)}>
                <Icon className={cn("h-4.5 w-4.5", color)} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none text-primary-foreground">
                  {metricsLoading ? "-" : metrics?.[key] ?? 0}
                </p>
                <p className="text-[10px] text-primary-foreground/60 mt-0.5 truncate">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ─────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h2>
          {unreadSms > 0 && (
            <span className="text-[10px] text-[hsl(var(--destructive))] font-medium">
              {unreadSms} unread SMS
            </span>
          )}
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {quickActions.map(({ label, icon: Icon, path, bg, color }) => (
            <Link key={label} to={path} className="shrink-0">
              <div className="flex flex-col items-center gap-1.5 w-16">
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm border border-border", bg)}>
                  <Icon className={cn("h-5 w-5", color)} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
                  {label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Tools & Builders ──────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tools & Builders</h2>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
          {toolCards.map(({ label, icon, path, color, bg }) => (
            <Link key={label + path} to={path}>
              <IconTile icon={icon} label={label} color={color} bg={bg} />
            </Link>
          ))}
        </div>
      </div>

      {/* ── Settings (grouped) ─────────── */}
      <div className="space-y-5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settings & Config</h2>
        {settingsGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[11px] font-semibold text-muted-foreground/80 mb-2 flex items-center gap-1.5">
              {(() => {
                const GroupIcon = group.icon;
                return <GroupIcon className="h-3.5 w-3.5" />;
              })()}
              <span className="uppercase tracking-wide">{group.title}</span>
            </p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
              {group.cards.map(({ label, icon, section, color, bg }) => (
                <div key={section} onClick={() => onNavigateSection(section)}>
                  <IconTile icon={icon} label={label} color={color} bg={bg} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Recent Activity ──────────────── */}
      {recentActivity && recentActivity.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
            <Link to="/" className="text-[10px] font-medium text-accent flex items-center gap-0.5">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <Card className="rounded-xl overflow-hidden">
            <div className="divide-y divide-border">
              {recentActivity.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.action}</p>
                    {item.details && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.details}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
