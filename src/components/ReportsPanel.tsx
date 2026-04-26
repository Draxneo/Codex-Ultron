import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  useRevenueByMonth,
  useJobsByTech,
  useJobsByType,
  useEstimateCloseRate,
  useOverdueTaskTrend,
  type ReportRange,
} from "@/hooks/useReportData";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { DollarSign, Users, Target, AlertTriangle, TrendingUp, Clock, Zap } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "hsl(var(--complete))", "hsl(var(--today))", "hsl(var(--overdue))", "#6366f1", "#8b5cf6"];
const TECH_COLORS = ["hsl(var(--sky))", "hsl(var(--complete))", "hsl(var(--warm))", "hsl(var(--primary))", "#6366f1", "#8b5cf6"];

const RANGE_OPTIONS: { value: ReportRange; label: string }[] = [
  { value: "1w", label: "1 Wk" },
  { value: "1m", label: "1 Mo" },
  { value: "lm", label: "Last Mo" },
  { value: "3m", label: "3 Mo" },
  { value: "6m", label: "6 Mo" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1 Yr" },
  { value: "2y", label: "2 Yr" },
];

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

export function ReportsPanel() {
  const [range, setRange] = useState<ReportRange>("6m");

  const { data: revenue, isLoading: revLoading } = useRevenueByMonth(range);
  const { data: byTech, isLoading: techLoading } = useJobsByTech(range);
  const { data: byType } = useJobsByType(range);
  const { data: closeRate } = useEstimateCloseRate(range);
  const { data: overdue } = useOverdueTaskTrend(range);
  const { data: metrics } = useDashboardMetrics();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Global range filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Reports & Analytics</h2>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => { if (v) setRange(v as ReportRange); }}
          className="bg-muted rounded-lg p-0.5"
        >
          {RANGE_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              className="text-xs px-3 py-1 h-7 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Metrics cards (moved from DashboardMetrics) */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Zap} label="Dispatched Today" value={`${metrics.dispatchedToday}`} />
          <StatCard icon={Clock} label="Awaiting Payment" value={`${metrics.awaitingPayment}`} />
          <StatCard icon={Target} label="Completed This Week" value={`${metrics.completedThisWeek}`} />
          <StatCard icon={DollarSign} label="Estimate Close Rate" value={`${closeRate?.closeRate ?? 0}%`} sub={`${closeRate?.won ?? 0} won / ${closeRate?.total ?? 0} total`} />
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={AlertTriangle} label="Overdue Tasks" value={`${overdue?.stillOverdue ?? 0}`} sub={`${overdue?.late ?? 0} completed late`} />
        <StatCard icon={TrendingUp} label="On-Time Tasks" value={`${overdue?.onTime ?? 0}`} />
        <StatCard icon={Users} label="Total Tracked" value={`${overdue?.total ?? 0}`} />
      </div>

      {/* Revenue chart */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Revenue by Month</h2>
        {revLoading ? <Skeleton className="h-48 w-full" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenue} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(val: number) => [`$${val.toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Jobs by Tech</h2>
          {techLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={(byTech?.length || 1) * 40 + 20}>
              <BarChart data={byTech} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number, name: string) => [val, name === "completed" ? "Completed" : "Total"]} />
                <Bar dataKey="total" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} barSize={16} opacity={0.3} />
                <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Jobs by Type</h2>
          {byType && byType.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70} strokeWidth={2}>
                    {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val: number) => [val, "Jobs"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {byType.map((t, i) => (
                  <div key={t.type} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="capitalize">{t.type}</span>
                    <span className="text-muted-foreground ml-auto">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <Skeleton className="h-48 w-full" />}
        </Card>
      </div>

      {closeRate && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Estimate Pipeline</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--complete))]">{closeRate.won}</p>
              <p className="text-xs text-muted-foreground">Won</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--overdue))]">{closeRate.lost}</p>
              <p className="text-xs text-muted-foreground">Lost</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--today))]">{closeRate.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
