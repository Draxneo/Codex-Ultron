import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { CustomerEnrichment } from "@/hooks/useCustomerEnrichment";

interface CustomerStatusBadgesProps {
  enrichment: CustomerEnrichment | undefined;
  /** Show the detail row (install info + agreement plan/date) */
  showDetail?: boolean;
  className?: string;
}

/** Derive the avatar background color class based on highest tier */
export function getAvatarColor(e: CustomerEnrichment | undefined): string {
  if (!e || e.job_count === 0) return "bg-sky-200 text-sky-800"; // new lead
  if (e.has_install) return "bg-blue-600 text-white"; // install customer
  if (e.job_count > 1) return "bg-teal-600 text-white"; // returning
  return "bg-emerald-600 text-white"; // single-job customer
}

export function CustomerStatusBadges({ enrichment, showDetail = false, className }: CustomerStatusBadgesProps) {
  if (!enrichment) return null;

  const e = enrichment;
  const badges: { label: string; dotClass: string; bgClass: string }[] = [];

  // Install badge
  if (e.has_install) {
    badges.push({ label: "Install", dotClass: "bg-blue-500", bgClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" });
  }

  // Returning badge
  if (e.job_count > 1) {
    badges.push({ label: "Returning", dotClass: "bg-emerald-500", bgClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" });
  }

  // Customer (has at least 1 invoiced job) vs New Lead
  if (e.job_count === 0) {
    badges.push({ label: "New lead", dotClass: "bg-sky-400", bgClass: "bg-sky-400/10 text-sky-700 dark:text-sky-300 border-sky-400/20" });
  } else if (e.job_count === 1 && !e.has_install) {
    badges.push({ label: "Customer", dotClass: "bg-green-500", bgClass: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20" });
  }

  // Agreement badge
  if (e.agreement_status === "active") {
    const sourceLabel = e.agreement_plan_source === "install_included" ? "Agreement (Included)"
      : e.agreement_plan_source === "purchased" ? "Agreement (Paid)"
      : "Agreement active";
    badges.push({ label: sourceLabel, dotClass: "bg-amber-500", bgClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" });
  } else if (e.agreement_status === "expired") {
    const expiredLabel = e.agreement_plan_source === "install_included" ? "Expired (Included)"
      : e.agreement_plan_source === "purchased" ? "Expired (Paid)"
      : "Agreement expired";
    badges.push({ label: expiredLabel, dotClass: "bg-muted-foreground", bgClass: "bg-muted/50 text-muted-foreground border-border" });
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Badge row */}
      <div className="flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <Badge
            key={b.label}
            variant="outline"
            className={cn("text-[10px] font-medium px-2 py-0 h-5 gap-1", b.bgClass)}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", b.dotClass)} />
            {b.label}
          </Badge>
        ))}
      </div>

      {/* Detail row */}
      {showDetail && (e.agreement_status !== "none" || e.has_install || e.job_count > 0) && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border/50 pt-1.5 mt-1 flex-wrap">
          {/* Install or last job date */}
          {e.has_install && e.last_job_date ? (
            <span>Install — {format(new Date(e.last_job_date), "MMM yyyy")}</span>
          ) : e.job_count > 0 && e.last_job_date ? (
            <span>Last job — {format(new Date(e.last_job_date), "MMM yyyy")}</span>
          ) : null}

          {/* Separator */}
          {(e.has_install || (e.job_count > 0 && e.last_job_date)) && e.agreement_status !== "none" && (
            <span className="text-border">·</span>
          )}

          {/* Agreement status */}
          {e.agreement_status === "active" && e.agreement_plan_name && e.agreement_end_date ? (
            <span className="text-foreground font-medium">
              {e.agreement_plan_name} — renews {format(new Date(e.agreement_end_date), "MMM yyyy")}
            </span>
          ) : e.agreement_status === "expired" && e.agreement_plan_name && e.agreement_end_date ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {e.agreement_plan_name} — expired {format(new Date(e.agreement_end_date), "MMM yyyy")}
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            </span>
          ) : e.agreement_status === "none" && e.job_count > 0 ? (
            <span className="text-muted-foreground/60 italic">No agreement</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
