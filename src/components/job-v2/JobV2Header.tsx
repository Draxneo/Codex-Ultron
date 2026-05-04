import { WorkOrderHeader } from "@/components/work/WorkOrderHeader";
import { JobEditDialog } from "./JobEditDialog";

interface Props {
  job: any;
  customerName: string;
  customerId?: string | null;
}

export function JobV2Header({ job, customerName, customerId }: Props) {
  const jobNumber = job?.job_number || job?.hcp_job_number || "—";
  return (
    <WorkOrderHeader
      entity={job}
      entityType="job"
      customerName={customerName}
      customerId={customerId}
      number={jobNumber}
      status={job?.status || "new"}
      hcpUrl={job?.hcp_id ? `https://pro.housecallpro.com/app/jobs/${job.hcp_id}` : null}
      actions={<JobEditDialog job={job} />}
    />
  );
}
