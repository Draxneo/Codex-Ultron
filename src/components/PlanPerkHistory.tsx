import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Percent, Wrench, Clock, Star, Shield, CheckCircle2, FileX } from "lucide-react";
import { usePlanPerkUsage, type PlanPerkUsage } from "@/hooks/usePlanPerkUsage";
import { useCustomerAgreements } from "@/hooks/useServiceAgreements";
import { useMaintenancePlanTemplates } from "@/hooks/useMaintenancePlanTemplates";

const PERK_ICONS: Record<string, any> = {
  discount: Percent,
  seasonal_tuneup: Wrench,
  priority_scheduling: Clock,
  free_diagnostic: Star,
  no_overtime: Clock,
  extended_warranty: Shield,
};

const PERK_COLORS: Record<string, string> = {
  discount: "bg-emerald-500/10 text-emerald-700",
  seasonal_tuneup: "bg-blue-500/10 text-blue-700",
  priority_scheduling: "bg-amber-500/10 text-amber-700",
  free_diagnostic: "bg-violet-500/10 text-violet-700",
  no_overtime: "bg-orange-500/10 text-orange-700",
  extended_warranty: "bg-cyan-500/10 text-cyan-700",
};

function AvailablePerks({ customerId }: { customerId: string }) {
  const { data: agreements, isLoading: loadingAgreements } = useCustomerAgreements(customerId);
  const { data: templates, isLoading: loadingTemplates } = useMaintenancePlanTemplates();

  if (loadingAgreements || loadingTemplates) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  const today = new Date().toISOString().split("T")[0];
  const active = agreements?.find(a => a.status === "active" && a.end_date >= today);

  if (!active) {
    return (
      <div className="text-center py-6 border border-dashed border-border rounded-lg">
        <FileX className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">No Active Plan</p>
        <p className="text-xs text-muted-foreground mt-0.5">This customer doesn't have an active maintenance agreement</p>
      </div>
    );
  }

  const template = templates?.find(t => t.name === active.plan_name);
  const perks: any[] = template?.perks || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{active.plan_name}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(active.start_date), "MMM d, yyyy")} — {format(new Date(active.end_date), "MMM d, yyyy")}
          </p>
        </div>
        <Badge variant="default" className="text-xs">Active</Badge>
      </div>

      {perks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No perks defined for this plan template</p>
      ) : (
        <div className="grid gap-1.5">
          {perks.map((perk: any, i: number) => {
            const key = typeof perk === "string" ? perk : perk.key || perk.type || "";
            const label = typeof perk === "string" ? perk.replace(/_/g, " ") : perk.label || perk.name || key.replace(/_/g, " ");
            const desc = typeof perk === "object" ? perk.description : null;
            const Icon = PERK_ICONS[key] || CheckCircle2;
            const colorClass = PERK_COLORS[key] || "bg-primary/10 text-primary";

            return (
              <div key={i} className="flex items-start gap-2.5 py-1.5 px-2 rounded-md bg-muted/40">
                <div className={`p-1 rounded-md ${colorClass} shrink-0 mt-0.5`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{label}</p>
                  {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PlanPerkHistory({ customerId }: { customerId: string }) {
  const { data: usage, isLoading } = usePlanPerkUsage(customerId);

  const totalSavings = (usage || []).reduce((sum, u) => sum + Number(u.applied_discount || 0), 0);

  return (
    <div className="space-y-5">
      {/* Available Perks */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Plan Benefits</h4>
        <AvailablePerks customerId={customerId} />
      </div>

      {/* Usage History */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Perk Usage History</h4>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : !usage?.length ? (
          <div className="text-center py-4">
            <Gift className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No perks used yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {totalSavings > 0 && (
              <Card className="p-3 bg-emerald-500/5 border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">Total Savings: ${totalSavings.toLocaleString()}</span>
                </div>
              </Card>
            )}
            <div className="space-y-2">
              {usage.map(u => {
                const Icon = PERK_ICONS[u.perk_type] || Gift;
                const colorClass = PERK_COLORS[u.perk_type] || "bg-muted text-muted-foreground";
                return (
                  <div key={u.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <div className={`p-1.5 rounded-md ${colorClass}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{u.description || u.perk_type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(u.created_at), "MMM d, yyyy")}</p>
                    </div>
                    {u.applied_discount > 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        -${Number(u.applied_discount).toLocaleString()}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function JobPerkBadges({ perks }: { perks: PlanPerkUsage[] }) {
  if (!perks?.length) return null;

  const totalSaved = perks.reduce((sum, p) => sum + Number(p.applied_discount || 0), 0);

  return (
    <Card className="p-3 bg-emerald-500/5 border-emerald-500/20">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold">Plan Perks Applied</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {perks.map(p => (
          <Badge key={p.id} variant="secondary" className="text-xs">
            {p.description || p.perk_type.replace(/_/g, " ")}
            {p.applied_discount > 0 && ` — saved $${Number(p.applied_discount).toLocaleString()}`}
          </Badge>
        ))}
      </div>
      {totalSaved > 0 && (
        <p className="text-xs text-emerald-600 mt-1.5 font-medium">Total saved on this job: ${totalSaved.toLocaleString()}</p>
      )}
    </Card>
  );
}
