import { Link } from "react-router-dom";
import type { ElementType } from "react";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Settings2,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { ModuleWorkbench } from "@/components/workbench/ModuleWorkbench";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useRecentActivity } from "@/hooks/useActivityLog";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { TOOL_CARDS, SETTINGS_GROUPS } from "@/config/adminNavigation";
import { routeToTabKey, useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import { errorMessage } from "@/lib/errorMessage";

const quickActions = [
  { label: "Dispatch HQ", icon: Briefcase, path: "/dispatch", group: "HQ" },
  { label: "Customer HQ", icon: Users, path: "/customers", group: "HQ" },
  { label: "Quote HQ", icon: FileText, path: "/quick-quote", group: "HQ" },
  { label: "Phone", icon: Phone, path: "/phone", group: "Communication" },
  { label: "Messages", icon: MessageSquare, path: "/sms", group: "Communication" },
];

const metricCards = [
  { key: "dispatchedToday" as const, label: "Dispatched", icon: Briefcase },
  { key: "totalActive" as const, label: "Active Jobs", icon: Clock },
  { key: "completedThisWeek" as const, label: "Done (7d)", icon: CheckCircle2 },
  { key: "awaitingPayment" as const, label: "Awaiting Pay", icon: CreditCard },
];

type HubItem = {
  label: string;
  description: string;
  group: string;
  icon: ElementType;
  color?: string;
  bg?: string;
  path?: string;
  section?: string;
};

type MarketplaceMode = "Explore" | "My apps" | "All apps";

function HubCard({ item, onNavigateSection }: { item: HubItem; onNavigateSection: (section: string) => void }) {
  const Icon = item.icon;
  const inner = (
    <Card className="h-full rounded-md border bg-card shadow-sm transition-colors hover:bg-muted/40">
      <CardContent className="flex h-full items-start gap-3 p-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary", item.bg, item.color)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight text-foreground">{item.label}</h3>
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          <Badge variant="outline" className="mt-2 h-5 rounded-sm px-1.5 text-[10px] font-medium">
            {item.group}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );

  if (item.path) {
    return (
      <Link to={item.path} className="block h-full">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className="block h-full w-full text-left" onClick={() => item.section && onNavigateSection(item.section)}>
      {inner}
    </button>
  );
}

export function AdminHub({ onNavigateSection }: { onNavigateSection: (section: string) => void }) {
  const { user } = useAuth();
  const { data: metrics, isLoading: metricsLoading, isError: metricsError, error: metricsQueryError } = useDashboardMetrics();
  const { data: recentActivity } = useRecentActivity(5);
  const unreadSms = useUnreadSmsCount();
  const allowedTabs = useEmployeeTabAccess();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [marketplaceMode, setMarketplaceMode] = useState<MarketplaceMode>("Explore");

  const firstName = user?.email?.split("@")[0] ?? "team";

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    await queryClient.invalidateQueries({ queryKey: ["recent_activity"] });
    setTimeout(() => setRefreshing(false), 600);
  }, [queryClient]);

  const items = useMemo<HubItem[]>(() => {
    const toolItems = TOOL_CARDS.map((tool) => ({
      label: tool.label,
      description: tool.label === "Catalog & Pricebook"
        ? "Manage services, repairs, materials, equipment systems, AHRI details, and sales pricing."
        : tool.label === "JARVIS"
          ? "Open the assistant workspace for notes, permissions, and office follow-up."
          : "Open this operational tool.",
      group: "Tools",
      icon: tool.icon,
      color: tool.color,
      bg: tool.bg,
      path: tool.path,
    }));

    const settingsItems = SETTINGS_GROUPS.flatMap((group) =>
      group.cards.map((card) => ({
        label: card.label,
        description: `${group.title} configuration and company controls.`,
        group: group.title,
        icon: card.icon,
        color: card.color,
        bg: card.bg,
        section: card.section,
      }))
    );

    return [
      ...quickActions.map((action) => ({
        ...action,
        description: "Open this shared workspace.",
        bg: "bg-muted",
        color: "text-foreground",
      })),
      ...toolItems,
      ...settingsItems,
    ];
  }, []);

  const categories = useMemo(() => ["All", "HQ", "Communication", "Tools", ...SETTINGS_GROUPS.map((group) => group.title), "Activity"], []);

  const canAccessItem = useCallback((item: HubItem) => {
    if (!allowedTabs) return true;
    const key = item.path ? routeToTabKey(item.path) : routeToTabKey("/admin", item.section ? `section=${item.section}` : undefined);
    return !key || allowedTabs.has(key);
  }, [allowedTabs]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesMode = marketplaceMode === "All apps"
        || (marketplaceMode === "My apps" ? canAccessItem(item) : item.group !== "Tags & Tools");
      const matchesCategory = category === "All" || item.group === category;
      const matchesSearch = !term || `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(term);
      return matchesMode && matchesCategory && matchesSearch;
    });
  }, [canAccessItem, category, items, marketplaceMode, search]);

  return (
    <main className="h-[calc(100vh-3rem)] min-h-0">
      <ModuleWorkbench
        title="Admin"
        eyebrow="Company control center"
        description={`Welcome back, ${firstName}. Tools, settings, reporting, and system health live here.`}
        icon={<Settings2 className="h-4.5 w-4.5" />}
        search={
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search admin tools"
              className="h-9 pl-8"
            />
          </div>
        }
        primaryAction={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh
          </Button>
        }
        meta={unreadSms > 0 ? <Badge variant="destructive">{unreadSms} unread SMS</Badge> : undefined}
        sideRail={
          <nav className="space-y-1 p-2">
            {categories.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setCategory(entry)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                  category === entry ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <span>{entry}</span>
                {entry === "Activity" && recentActivity?.length ? (
                  <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px]">{recentActivity.length}</Badge>
                ) : null}
              </button>
            ))}
          </nav>
        }
        contentClassName="p-4 md:p-6"
      >
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            {metricCards.map(({ key, label, icon: Icon }) => (
              <Card key={key} className="rounded-md">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold leading-none">{metricsLoading ? "-" : metrics?.[key] ?? 0}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {metricsError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Admin counts need a quick check.</p>
                <p className="text-xs opacity-90">{errorMessage(metricsQueryError)}. Refresh before trusting these numbers.</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-card p-1">
            {(["Explore", "My apps", "All apps"] as MarketplaceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMarketplaceMode(mode)}
                className={cn(
                  "h-8 rounded-sm px-3 text-sm font-medium transition-colors",
                  marketplaceMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {category !== "Activity" && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {marketplaceMode === "Explore" && category === "All" ? "Explore Admin Apps" : category === "All" ? marketplaceMode : category}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {marketplaceMode === "My apps"
                      ? "Tools and settings available to your current role."
                      : "Launcher for the real tools the office team uses today."}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-sm">{visibleItems.length} items</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((item) => (
                  <HubCard key={`${item.group}-${item.label}`} item={item} onNavigateSection={onNavigateSection} />
                ))}
              </div>
            </section>
          )}

          {(category === "All" || category === "Activity") && recentActivity && recentActivity.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                  <p className="text-xs text-muted-foreground">Latest system activity and follow-ups.</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1.5">
                  <Link to="/dispatch">Open Dispatch HQ <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
              <Card className="rounded-md">
                <CardContent className="divide-y p-0">
                  {recentActivity.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Zap className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.action}</p>
                        {item.details && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.details}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      </ModuleWorkbench>
    </main>
  );
}
