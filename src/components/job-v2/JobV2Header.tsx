import { Link } from "react-router-dom";
import { ChevronRight, Pencil, ExternalLink } from "lucide-react";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { HcpStatusBadge } from "@/components/HcpStatusBadge";

interface Props {
  job: any;
  customerName: string;
  customerId?: string | null;
}

export function JobV2Header({ job, customerName, customerId }: Props) {
  const jobNumber = job?.job_number || job?.hcp_job_number || "—";
  return (
    <div className="border-b bg-card px-6 py-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
        <Link to="/customers" className="hover:text-primary">Customers</Link>
        <ChevronRight className="h-3 w-3" />
        {customerId ? (
          <Link to={`/customers/${customerId}`} className="hover:text-primary">{customerName}</Link>
        ) : (
          <span>{customerName}</span>
        )}
        <ChevronRight className="h-3 w-3" />
        <span>Jobs</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">Job #{jobNumber}</span>
      </nav>

      {/* Title row */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold leading-tight">Job for {customerName}</h1>
        <button className="text-muted-foreground hover:text-foreground p-1 rounded">
          <Pencil className="h-4 w-4" />
        </button>
        <JobStatusBadge status={job?.status || "new"} />
        {job?.hcp_status && <HcpStatusBadge status={job.hcp_status} />}
        {job?.hcp_id && (
          <a
            href={`https://pro.housecallpro.com/app/jobs/${job.hcp_id}`}
            target="_blank"
            rel="noopener"
            className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in HCP
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">Job #{jobNumber}</p>
    </div>
  );
}
