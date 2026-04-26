import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Target, DollarSign, Save, AlertTriangle, CheckCircle2, Minus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PAY_CATEGORY_LABELS } from "@/lib/resolvePayCategory";

interface JobProfitRow {
  id: string;
  hcp_job_number: string | null;
  customer_name: string | null;
  job_type: string | null;
  pay_category: string | null;
  parts_cost: number;
  labor_cost: number;
  total_cost: number;
  profit: number;
  margin_pct: number;
  status: string | null;
  revenue: number;
}

interface KpiTarget {
  id?: string;
  category: string;
  target_margin_pct: number;
  min_margin_pct: number;
  notes: string | null;
}

export function ProfitWatchCard() {
  const [jobs, setJobs] = useState<JobProfitRow[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [savingTargets, setSavingTargets] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [jobsRes, targetsRes, invoicesRes] = await Promise.all([
      supabase.from("jobs")
        .select("id, hcp_job_number, customer_name, job_type, pay_category, parts_cost, labor_cost, total_cost, profit, margin_pct, status")
        .in("status", ["done", "invoiced", "paid"] as any)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("profit_kpi_targets" as any).select("*").order("category") as any,
      supabase.from("customer_invoices")
        .select("job_id, total, status")
        .in("status", ["paid", "sent"])
    ]);

    const invoiceMap: Record<string, number> = {};
    for (const inv of (invoicesRes.data || []) as any[]) {
      invoiceMap[inv.job_id] = (invoiceMap[inv.job_id] || 0) + (inv.total || 0);
    }

    const enrichedJobs: JobProfitRow[] = ((jobsRes.data || []) as any[]).map(j => ({
      ...j,
      parts_cost: j.parts_cost || 0,
      labor_cost: j.labor_cost || 0,
      total_cost: j.total_cost || 0,
      profit: j.profit || 0,
      margin_pct: j.margin_pct || 0,
      revenue: invoiceMap[j.id] || 0,
    }));

    setJobs(enrichedJobs);
    setTargets((targetsRes.data || []) as KpiTarget[]);
    setLoading(false);
  };

  const filteredJobs = filter === "all" ? jobs : jobs.filter(j => j.pay_category === filter || j.job_type === filter);

  const getTargetForCategory = (cat: string | null): KpiTarget | undefined => {
    return targets.find(t => t.category === cat) || targets.find(t => t.category === "service");
  };

  const getMarginStatus = (margin: number, target: KpiTarget | undefined) => {
    if (!target || margin === 0) return "neutral";
    if (margin >= target.target_margin_pct) return "good";
    if (margin >= target.min_margin_pct) return "warning";
    return "bad";
  };

  const updateTarget = (category: string, field: string, value: number) => {
    setTargets(prev => prev.map(t => t.category === category ? { ...t, [field]: value } : t));
  };

  const handleSaveTargets = async () => {
    setSavingTargets(true);
    for (const t of targets) {
      if (t.id) {
        await supabase.from("profit_kpi_targets" as any)
          .update({ target_margin_pct: t.target_margin_pct, min_margin_pct: t.min_margin_pct, updated_at: new Date().toISOString() } as any)
          .eq("id", t.id);
      }
    }
    setSavingTargets(false);
    toast({ title: "KPI targets saved" });
  };

  const totalRevenue = filteredJobs.reduce((s, j) => s + j.revenue, 0);
  const totalProfit = filteredJobs.reduce((s, j) => s + j.profit, 0);
  const avgMargin = filteredJobs.length > 0 ? filteredJobs.reduce((s, j) => s + j.margin_pct, 0) / filteredJobs.length : 0;
  const belowTarget = filteredJobs.filter(j => {
    const t = getTargetForCategory(j.pay_category);
    return t && j.margin_pct > 0 && j.margin_pct < t.min_margin_pct;
  }).length;

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const uniqueCategories = [...new Set(jobs.map(j => j.pay_category).filter(Boolean))] as string[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Profit Watch
        </CardTitle>
        <CardDescription className="text-xs">
          Track job-level profitability against KPI targets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</p>
            <p className="text-lg font-bold text-foreground">{fmt(totalRevenue)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit</p>
            <p className="text-lg font-bold text-emerald-600">{fmt(totalProfit)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Margin</p>
            <p className="text-lg font-bold text-foreground">{avgMargin.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Below Min</p>
            <p className={cn("text-lg font-bold", belowTarget > 0 ? "text-destructive" : "text-emerald-600")}>{belowTarget}</p>
          </div>
        </div>

        {/* Filter */}
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {uniqueCategories.map(cat => (
              <SelectItem key={cat} value={cat}>{PAY_CATEGORY_LABELS[cat] || cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Jobs table */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : filteredJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No completed jobs with cost data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Job</th>
                  <th className="text-left py-2 font-medium">Category</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                  <th className="text-right py-2 font-medium">Parts</th>
                  <th className="text-right py-2 font-medium">Labor</th>
                  <th className="text-right py-2 font-medium">Profit</th>
                  <th className="text-right py-2 font-medium">Margin</th>
                  <th className="text-center py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.slice(0, 50).map(job => {
                  const target = getTargetForCategory(job.pay_category);
                  const status = getMarginStatus(job.margin_pct, target);
                  return (
                    <tr key={job.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2">
                        <span className="font-medium">#{job.hcp_job_number || "N/A"}</span>
                        <span className="text-muted-foreground ml-1">{(job.customer_name || "").slice(0, 20)}</span>
                      </td>
                      <td className="py-2">
                        <Badge variant="secondary" className="text-[9px]">
                          {PAY_CATEGORY_LABELS[job.pay_category || ""] || job.job_type || "?"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right font-medium">{fmt(job.revenue)}</td>
                      <td className="py-2 text-right text-muted-foreground">{fmt(job.parts_cost)}</td>
                      <td className="py-2 text-right text-muted-foreground">{fmt(job.labor_cost)}</td>
                      <td className="py-2 text-right font-medium text-emerald-600">{fmt(job.profit)}</td>
                      <td className="py-2 text-right font-bold">
                        {job.margin_pct > 0 ? `${job.margin_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 text-center">
                        {status === "good" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />}
                        {status === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mx-auto" />}
                        {status === "bad" && <TrendingDown className="h-3.5 w-3.5 text-destructive mx-auto" />}
                        {status === "neutral" && <Minus className="h-3.5 w-3.5 text-muted-foreground mx-auto" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* KPI Targets editor */}
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Target className="h-4 w-4" /> Margin KPI Targets
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {targets.map(t => (
              <div key={t.category} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate font-medium">{PAY_CATEGORY_LABELS[t.category] || t.category}</span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Target:</span>
                  <Input
                    type="number"
                    className="w-16 h-7 text-xs"
                    value={t.target_margin_pct}
                    onChange={e => updateTarget(t.category, "target_margin_pct", Number(e.target.value))}
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Min:</span>
                  <Input
                    type="number"
                    className="w-16 h-7 text-xs"
                    value={t.min_margin_pct}
                    onChange={e => updateTarget(t.category, "min_margin_pct", Number(e.target.value))}
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" onClick={handleSaveTargets} disabled={savingTargets} className="text-xs">
            <Save className="h-3.5 w-3.5 mr-1" />
            {savingTargets ? "Saving..." : "Save Targets"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
