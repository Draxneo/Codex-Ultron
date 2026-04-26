import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { HcpStatusBadge } from "@/components/HcpStatusBadge";

type WorkEntityType = "job" | "estimate";

interface WorkOrderHeaderProps {
  entity: any;
  entityType: WorkEntityType;
  customerName: string;
  customerId?: string | null;
  number?: string | null;
  status?: string | null;
  hcpUrl?: string | null;
}

export function WorkOrderHeader({
  entity,
  entityType,
  customerName,
  customerId,
  number,
  status,
  hcpUrl,
}: WorkOrderHeaderProps) {
  const label = entityType === "estimate" ? "Estimate" : "Job";
  const plural = entityType === "estimate" ? "Estimates" : "Jobs";
  const displayNumber =
    number ||
    entity?.job_number ||
    entity?.hcp_job_number ||
    entity?.estimate_number ||
    "-";

  return (
    <div className="border-b bg-card px-6 py-4">
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/customers" className="hover:text-primary">Customers</Link>
        <ChevronRight className="h-3 w-3" />
        {customerId ? (
          <Link to={`/customers/${customerId}`} className="hover:text-primary">{customerName}</Link>
        ) : (
          <span>{customerName}</span>
        )}
        <ChevronRight className="h-3 w-3" />
        <span>{plural}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">{label} #{displayNumber}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-words text-2xl font-bold leading-tight">{label} for {customerName}</h1>
        <JobStatusBadge status={status || "new"} entityType={entityType} />
        {entity?.hcp_status && <HcpStatusBadge status={entity.hcp_status} />}
        {hcpUrl && (
          <a
            href={hcpUrl}
            target="_blank"
            rel="noopener"
            className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> HCP source
          </a>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label} #{displayNumber}</p>
    </div>
  );
}
