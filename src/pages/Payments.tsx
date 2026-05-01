import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DollarSign, AlertTriangle, CreditCard, RefreshCw, TrendingUp, Search, Settings2, ChevronDown, ChevronRight, Clock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useStripeEvents, usePaymentsSummary } from "@/hooks/usePaymentsDashboard";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { MaintenancePlanTemplatesCard } from "@/components/MaintenancePlanTemplatesCard";
import { PaymentPlanRulesCard } from "@/components/PaymentPlanRulesCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { APP_ACTION_GO_LIVE_ISO } from "@/lib/appLifecycle";
import { errorMessage } from "@/lib/errorMessage";

import { PAYMENT_STATUS_COLORS as STATUS_COLORS } from "@/lib/statusColors";

export default function Payments() {
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: events, isLoading } = useStripeEvents({ status: statusFilter, search });
  const summary = usePaymentsSummary();
  const navigate = useNavigate();

  // Unpaid invoices sent > 7 days ago
  const { data: unpaidInvoices } = useQuery({
    queryKey: ["unpaid-invoices-7d"],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase
        .from("customer_invoices")
        .select("id, invoice_number, total, sent_at, job_id, status")
        .eq("status", "sent")
        .lt("sent_at", sevenDaysAgo.toISOString())
        .is("paid_at", null)
        .gte("created_at", APP_ACTION_GO_LIVE_ISO)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  const moneyTabs = [
    { label: "Pending", value: "pending", caption: "Needs action or payout" },
    { label: "Payouts", value: "succeeded", caption: "Deposited or collected" },
    { label: "Refunds", value: "refunded", caption: "Returned payments" },
    { label: "Failed", value: "failed", caption: "Follow-up required" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-[hsl(var(--complete))]" /> Payments
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {moneyTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                statusFilter === tab.value
                  ? "border-accent bg-accent/10 text-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <p className="text-sm font-semibold">{tab.label}</p>
              <p className="mt-0.5 text-[11px] leading-tight">{tab.caption}</p>
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-[hsl(var(--complete))]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--complete))]" /> Collected This Month
              </div>
              <p className="text-xl font-bold">{fmt(summary.collectedThisMonth)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[hsl(var(--sky))]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <DollarSign className="h-3.5 w-3.5 text-[hsl(var(--sky))]" /> Outstanding
              </div>
              <p className="text-xl font-bold">{fmt(summary.outstandingTotal)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-destructive">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Failed This Month
              </div>
              <p className="text-xl font-bold text-destructive">{summary.failedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[hsl(var(--warning))]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Active Subscriptions
              </div>
              <p className="text-xl font-bold">{summary.activeSubscriptions}</p>
            </CardContent>
          </Card>
        </div>

        {summary.isError && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Payment summary needs a quick check.</p>
                <p className="text-xs opacity-90">{errorMessage(summary.error)}. Refresh before trusting the payment totals.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Unpaid Invoices — sent > 7 days, not paid */}
        {unpaidInvoices && unpaidInvoices.length > 0 && (
          <Card className="border-l-4 border-l-destructive">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-destructive" /> Unpaid Invoices (7+ Days)
                <Badge variant="destructive" className="ml-auto text-xs">{unpaidInvoices.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {unpaidInvoices.map((inv: any) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => inv.job_id && navigate(`/jobs/${inv.job_id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        Invoice #{inv.invoice_number || inv.id.slice(0, 8)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Sent {inv.sent_at ? formatDistanceToNow(new Date(inv.sent_at), { addSuffix: true }) : "—"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-destructive">{fmt(inv.total)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Activity Feed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Payment Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingSpinner label="Loading payments…" size="sm" className="py-8" />
            ) : !events || events.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No payment events yet"
                description="Events will appear here once payments are processed."
                className="py-8"
              />
            ) : (
              <div className="divide-y divide-border">
                {events.map((evt: any) => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      if (evt.job_id) navigate(`/jobs/${evt.job_id}`);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{evt.description}</span>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[evt.status] || ""}`}>
                          {evt.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {evt.customer_email || "No email"} · {evt.event_type}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${evt.status === "failed" ? "text-destructive" : ""}`}>
                        {evt.amount > 0 ? fmt(evt.amount) : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(evt.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings Section */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
            {settingsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Settings2 className="h-4 w-4" />
            Payment & Plan Settings
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4">
            <MaintenancePlanTemplatesCard />
            <PaymentPlanRulesCard />
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
}
