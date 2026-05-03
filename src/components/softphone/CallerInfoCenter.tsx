import { useMemo } from "react";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { useCustomerEquipment } from "@/hooks/useCustomerEquipment";
import { useCustomerEnrichment } from "@/hooks/useCustomerEnrichment";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  User, Wrench, Briefcase, FileText, Clock, Loader2, PhoneIncoming,
} from "lucide-react";
import { format } from "date-fns";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { CustomerCard } from "@/components/CustomerCard";
import { formatPhone } from "@/lib/formatters";

interface CallerInfoCenterProps {
  phoneNumber: string | null | undefined;
  callerName?: string;
}

export function CallerInfoCenter({ phoneNumber, callerName }: CallerInfoCenterProps) {
  const { data: customer, isLoading: lookupLoading } = useCallerLookup(phoneNumber);
  const customerId = customer?.id;
  const { data: enrichmentMap } = useCustomerEnrichment();
  const enrichment = customerId ? enrichmentMap?.get(customerId) : undefined;

  // Fetch the most recent inbound call_log for this number to get IVR department
  const normalizedPhone = phoneNumber?.replace(/\D/g, "").slice(-10) || "";
  const { data: activeCallLog } = useQuery({
    queryKey: ["caller_department", normalizedPhone],
    enabled: normalizedPhone.length === 10,
    refetchInterval: 5000, // Poll while on call to catch IVR selection
    queryFn: async () => {
      // Try common E.164 formats for the phone number
      const e164 = normalizedPhone.length === 10 ? `+1${normalizedPhone}` : phoneNumber || "";
      const { data, error } = await supabase
        .from("call_log")
        .select("extracted_data")
        .eq("direction", "inbound")
        .eq("phone_number", e164)
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const ed = (data?.[0]?.extracted_data as Record<string, unknown>) || {};
      return (ed.ivr_department as string) || undefined;
    },
  });

  // Recent jobs for this customer
  const { data: recentJobs } = useQuery({
    queryKey: ["caller_jobs", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, job_type, status, scheduled_date, assigned_to, description")
        .eq("customer_id", customerId!)
        .order("scheduled_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Open estimates
  const { data: estimates } = useQuery({
    queryKey: ["caller_estimates", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("id, estimate_number, status, scheduled_date, description, options")
        .eq("customer_id", customerId!)
        .not("status", "eq", "lost")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Equipment
  const { data: equipment } = useCustomerEquipment(customerId);

  // Copilot context string
  const prettyPhone = formatPhone(phoneNumber) || phoneNumber || "";
  const contextSummary = useMemo(() => {
    if (!customer) return null;
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
    const parts = [`On a call with ${name} (${prettyPhone})`];
    if (recentJobs?.length) parts.push(`${recentJobs.length} recent jobs`);
    if (estimates?.length) parts.push(`${estimates.length} estimates`);
    if (equipment?.length) parts.push(`Equipment: ${equipment.map(e => `${e.brand || ""} ${e.model_number || e.equipment_type}`).join(", ")}`);
    if (enrichment?.agreement_status === "active" && enrichment.agreement_plan_name) {
      parts.push(`Plan: ${enrichment.agreement_plan_name}`);
    }
    return parts.join(". ");
  }, [customer, prettyPhone, recentJobs, estimates, equipment, enrichment]);

  if (!phoneNumber) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
        Dial or receive a call to see customer info
      </div>
    );
  }

  if (lookupLoading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Looking up caller…
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex-1 p-4 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="h-4 w-4" />
          <span className="text-sm font-medium">Unknown Caller</span>
        </div>
        <p className="text-xs text-muted-foreground">{prettyPhone}</p>
        {activeCallLog && (
          <Badge variant="outline" className="text-xs gap-1 border-amber-500/50 text-amber-600">
            <PhoneIncoming className="h-3 w-3" /> {activeCallLog}
          </Badge>
        )}
        <p className="text-xs text-muted-foreground mt-4">No matching customer record found.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-3">
        {/* Unified Customer Card */}
        <CustomerCard
          customer={customer}
          enrichment={enrichment}
          variant="caller"
        />

        {/* IVR Department Selection */}
        {activeCallLog && (
          <Badge variant="outline" className="text-xs gap-1 border-primary/50 text-primary">
            <PhoneIncoming className="h-3 w-3" /> Calling about: {activeCallLog}
          </Badge>
        )}

        {/* Recent Jobs */}
        {recentJobs && recentJobs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="h-3 w-3" /> Recent Jobs
              </h4>
              {recentJobs.map((job: any) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-primary font-medium">#{job.job_number}</span>
                    <span className="truncate text-muted-foreground">{job.job_type || job.description?.slice(0, 30)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {job.scheduled_date && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(job.scheduled_date), "M/d")}
                      </span>
                    )}
                    <JobStatusBadge status={job.status} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Open Estimates */}
        {estimates && estimates.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Estimates
              </h4>
              {estimates.map((est: any) => (
                <div
                  key={est.id}
                  className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-primary font-medium">#{est.estimate_number}</span>
                    <span className="truncate text-muted-foreground">{est.description?.slice(0, 30)}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{est.status}</Badge>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Equipment */}
        {equipment && equipment.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Wrench className="h-3 w-3" /> Equipment
              </h4>
              {equipment.map((eq) => {
                const age = eq.install_date
                  ? `${Math.floor((Date.now() - new Date(eq.install_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}y`
                  : null;
                return (
                  <div
                    key={eq.id}
                    className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium">{eq.equipment_type}</span>
                      <span className="text-muted-foreground truncate">
                        {[eq.brand, eq.model_number].filter(Boolean).join(" ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {age && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />{age}
                        </span>
                      )}
                      {eq.serial_number && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          S/N: {eq.serial_number.slice(-6)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Context summary for Copilot seeding */}
        {contextSummary && (
          <div className="hidden" data-copilot-context={contextSummary} />
        )}
      </div>
    </ScrollArea>
  );
}
