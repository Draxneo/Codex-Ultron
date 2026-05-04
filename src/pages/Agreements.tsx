import { useState, useMemo, useCallback } from "react";
import { format, isPast, differenceInDays } from "date-fns";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, AlertTriangle, CheckCircle2, CreditCard, Crown, Clock, ArrowLeft,
  ChevronDown, Users, DollarSign,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useServiceAgreements, useCreateAgreement, useUpdateAgreement, type ServiceAgreement } from "@/hooks/useServiceAgreements";
import { useCustomerNames } from "@/hooks/useCustomers";
import { useMaintenancePlanTemplates } from "@/hooks/useMaintenancePlanTemplates";
import { toast } from "@/hooks/use-toast";

function AgreementForm({ onSave, customerNames }: { onSave: (data: any) => void; customerNames: Map<string, { name: string; phone: string | null; address: string | null }> }) {
  const { data: templates } = useMaintenancePlanTemplates(true);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    plan_name: "",
    plan_type: "annual",
    frequency: "biannual",
    price: "199",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0],
    status: "active",
    notes: "",
  });

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const t = (templates || []).find(tp => tp.id === templateId);
    if (t) {
      setForm(p => ({
        ...p,
        plan_name: t.name,
        plan_type: t.plan_type,
        frequency: t.frequency,
        price: String(t.price),
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Customer</Label>
        <Select value={form.customer_id} onValueChange={(v) => setForm(p => ({ ...p, customer_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
          <SelectContent className="max-h-60">
            {Array.from(customerNames.entries()).map(([id, c]) => (
              <SelectItem key={id} value={id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {templates && templates.length > 0 && (
        <div>
          <Label>Plan Template</Label>
          <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
            <SelectTrigger><SelectValue placeholder="Pick a template (or customize below)" /></SelectTrigger>
            <SelectContent>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} — ${Number(t.price).toLocaleString()}/{t.plan_type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div><Label>Plan Name</Label><Input value={form.plan_name} onChange={e => setForm(p => ({ ...p, plan_name: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Plan Type</Label>
          <Select value={form.plan_type} onValueChange={(v) => setForm(p => ({ ...p, plan_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="biannual">Bi-Annual</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Frequency</Label>
          <Select value={form.frequency} onValueChange={(v) => setForm(p => ({ ...p, frequency: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">1x/year</SelectItem>
              <SelectItem value="biannual">2x/year</SelectItem>
              <SelectItem value="quarterly">4x/year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Price</Label><Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
        <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} /></div>
      </div>
      <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
      <Button className="w-full" onClick={() => {
        if (!form.customer_id) { toast({ title: "Select a customer", variant: "destructive" }); return; }
        if (!form.plan_name.trim()) { toast({ title: "Enter a plan name", variant: "destructive" }); return; }
        onSave({ ...form, price: Number(form.price) });
      }}>Save Membership</Button>
    </div>
  );
}

type FilterTab = "all" | "active" | "expiring" | "expired";

export default function Agreements() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: agreements, isLoading } = useServiceAgreements();
  const { data: customerNames } = useCustomerNames();
  const createMutation = useCreateAgreement();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");

  const handleCreate = async (data: any) => {
    await createMutation.mutateAsync(data);
    setCreating(false);
    toast({ title: "Membership created" });
  };

  const getStatus = (a: ServiceAgreement): "active" | "expiring" | "expired" | "cancelled" => {
    if (a.status === "cancelled") return "cancelled";
    if (a.status === "expired") return "expired";
    if (isPast(new Date(a.end_date))) return "expired";
    if (differenceInDays(new Date(a.end_date), new Date()) <= 30) return "expiring";
    return "active";
  };

  const customerName = useCallback((customerId: string) => {
    return customerNames.get(customerId)?.name || "Unknown";
  }, [customerNames]);

  // Categorize agreements
  const categorized = useMemo(() => {
    const all = agreements || [];
    return {
      active: all.filter(a => getStatus(a) === "active"),
      expiring: all.filter(a => getStatus(a) === "expiring"),
      expired: all.filter(a => getStatus(a) === "expired" || getStatus(a) === "cancelled"),
    };
  }, [agreements]);

  // Filter based on tab
  const filtered = useMemo(() => {
    const all = agreements || [];
    if (filter === "active") return categorized.active;
    if (filter === "expiring") return categorized.expiring;
    if (filter === "expired") return categorized.expired;
    return all;
  }, [agreements, filter, categorized]);

  // Group by end_date month
  const monthGroups = useMemo(() => {
    const activeAndExpiring = filtered.filter(a => getStatus(a) !== "expired" && getStatus(a) !== "cancelled");
    const past = filtered.filter(a => getStatus(a) === "expired" || getStatus(a) === "cancelled");

    const groups: Record<string, ServiceAgreement[]> = {};
    for (const a of activeAndExpiring) {
      const key = format(new Date(a.end_date), "MMMM yyyy");
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }

    // Sort each group alphabetically by customer name
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => customerName(a.customer_id).localeCompare(customerName(b.customer_id)));
    }

    // Sort months chronologically
    const sortedKeys = Object.keys(groups).sort((a, b) =>
      new Date(groups[a][0].end_date).getTime() - new Date(groups[b][0].end_date).getTime()
    );

    return { sortedKeys, groups, past };
  }, [filtered, customerName]);

  const statusBadge = (a: ServiceAgreement) => {
    const s = getStatus(a);
    if (s === "cancelled") return <Badge variant="outline" className="text-[10px]">Cancelled</Badge>;
    if (s === "expired") return <Badge variant="destructive" className="text-[10px]">Expired</Badge>;
    if (s === "expiring") return <Badge className="text-[10px] bg-[hsl(var(--today))] text-[hsl(var(--today-foreground,var(--primary-foreground)))]">Expiring</Badge>;
    return <Badge className="text-[10px] bg-[hsl(var(--complete))] text-white">Active</Badge>;
  };

  const annualRev = categorized.active.reduce((s, a) => s + Number(a.price), 0) +
    categorized.expiring.reduce((s, a) => s + Number(a.price), 0);

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="p-4 pb-8 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" /> Comfort Club Memberships
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/payments")}>
              <Crown className="h-4 w-4 mr-1" /> Plan Templates
            </Button>
            <Button size="sm" className="text-xs bg-[hsl(var(--complete))] text-white hover:bg-[hsl(var(--complete))]/90" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Member
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center border-t-4 border-t-primary">
            <Users className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{categorized.active.length + categorized.expiring.length}</p>
            <p className="text-[10px] text-muted-foreground">Active Members</p>
          </Card>
          <Card className="p-3 text-center border-t-4 border-t-[hsl(var(--warning))]">
            <AlertTriangle className="h-4 w-4 mx-auto text-[hsl(var(--warning))] mb-1" />
            <p className="text-lg font-bold">{categorized.expiring.length}</p>
            <p className="text-[10px] text-muted-foreground">Expiring ≤30d</p>
          </Card>
          <Card className="p-3 text-center border-t-4 border-t-[hsl(var(--complete))]">
            <DollarSign className="h-4 w-4 mx-auto text-[hsl(var(--complete))] mb-1" />
            <p className="text-lg font-bold">${annualRev.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Paid Member Revenue</p>
          </Card>
        </div>

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1 text-xs">All ({(agreements || []).length})</TabsTrigger>
            <TabsTrigger value="active" className="flex-1 text-xs">Active ({categorized.active.length})</TabsTrigger>
            <TabsTrigger value="expiring" className="flex-1 text-xs">Expiring ({categorized.expiring.length})</TabsTrigger>
            <TabsTrigger value="expired" className="flex-1 text-xs">Expired ({categorized.expired.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>}

        {!isLoading && (
          <div className="space-y-3">
            {/* Month-grouped active/expiring members */}
            {monthGroups.sortedKeys.map(monthKey => (
              <Collapsible key={monthKey} defaultOpen={monthKey === format(new Date(), "MMMM yyyy")}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors group">
                  <span className="text-base font-bold text-foreground">{monthKey}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{monthGroups.groups[monthKey].length}</Badge>
                    <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {monthGroups.groups[monthKey].map(a => (
                    <MemberCard
                      key={a.id}
                      agreement={a}
                      name={customerName(a.customer_id)}
                      statusBadge={statusBadge(a)}
                      onNavigate={() => navigate(`/customers/${a.customer_id}`)}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}

            {/* Past members */}
            {monthGroups.past.length > 0 && (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 rounded-xl bg-muted/50 hover:bg-muted/30 transition-colors group">
                  <span className="text-base font-bold text-muted-foreground">Past Members</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{monthGroups.past.length}</Badge>
                    <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {monthGroups.past
                    .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
                    .map(a => (
                      <MemberCard
                        key={a.id}
                        agreement={a}
                        name={customerName(a.customer_id)}
                        statusBadge={statusBadge(a)}
                        onNavigate={() => navigate(`/customers/${a.customer_id}`)}
                      />
                    ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Crown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No memberships found</p>
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Comfort Club Member</DialogTitle>
            <DialogDescription>Add a customer to a maintenance agreement and choose their plan details.</DialogDescription>
          </DialogHeader>
          <AgreementForm onSave={handleCreate} customerNames={customerNames} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberCard({
  agreement: a,
  name,
  statusBadge,
  onNavigate,
}: {
  agreement: ServiceAgreement;
  name: string;
  statusBadge: React.ReactNode;
  onNavigate: () => void;
}) {
  const visitPct = a.total_visits > 0 ? (a.visits_used / a.total_visits) * 100 : 0;
  const daysLeft = differenceInDays(new Date(a.end_date), new Date());
  const isActive = a.status === "active" && !isPast(new Date(a.end_date));

  return (
    <Card className="p-3 ml-2 border-l-4 border-l-transparent hover:border-l-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold text-primary hover:underline cursor-pointer truncate"
            onClick={onNavigate}
          >
            {name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(a as any).plan_source === 'install_included'
              ? "Comfort Club · Included with Install"
              : `${a.plan_name} · $${Number(a.price).toLocaleString()}/${a.plan_type}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {statusBadge}
          {(a as any).stripe_subscription_id && (
            <Badge className="text-[10px] bg-primary/10 text-primary">Stripe</Badge>
          )}
        </div>
      </div>

      {/* Visit progress + dates */}
      <div className="mt-2 space-y-1.5">
        {isActive && a.total_visits > 0 && (
          <div className="flex items-center gap-2">
            <Progress value={visitPct} className="h-1.5 flex-1" />
            <span className={cn(
              "text-[10px] font-medium whitespace-nowrap",
              a.visits_used >= a.total_visits ? "text-[hsl(var(--complete))]" : "text-muted-foreground"
            )}>
              {a.visits_used} of {a.total_visits} visits
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {format(new Date(a.start_date), "MMM d, yyyy")} → {format(new Date(a.end_date), "MMM d, yyyy")}
          </span>
          {isActive && daysLeft > 0 && (
            <span className={cn(
              "inline-flex items-center gap-1 font-medium",
              daysLeft <= 30 ? "text-[hsl(var(--warning))]" : "text-muted-foreground"
            )}>
              <Clock className="h-3 w-3" /> {daysLeft}d left
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
