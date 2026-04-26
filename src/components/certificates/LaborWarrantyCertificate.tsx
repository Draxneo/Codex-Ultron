import { CertificateTemplate } from "./CertificateTemplate";
import { format } from "date-fns";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";

interface LaborWarrantyCertificateProps {
  customerName: string;
  equipmentDescription: string;
  installDate: string;
  warrantyYears?: number;
}

export function LaborWarrantyCertificate({
  customerName, equipmentDescription, installDate, warrantyYears = 2,
}: LaborWarrantyCertificateProps) {
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const installDateFormatted = installDate ? format(new Date(installDate), "MMMM d, yyyy") : "-";
  const expirationDate = installDate
    ? format(new Date(new Date(installDate).setFullYear(new Date(installDate).getFullYear() + warrantyYears)), "MMMM d, yyyy")
    : "-";

  return (
    <CertificateTemplate
      title="Labor Warranty Certificate"
      subtitle={`${warrantyYears}-Year Labor Coverage`}
    >
      <div className="text-center space-y-6 w-full max-w-lg">
        <p className="text-sm text-muted-foreground">This certifies that</p>
        <p className="text-2xl font-semibold text-primary">{customerName}</p>
        <p className="text-sm text-muted-foreground">
          is covered under a {warrantyYears}-year labor warranty for the following installation:
        </p>

        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
          <div><span className="text-muted-foreground">Equipment:</span> <span className="font-medium">{equipmentDescription}</span></div>
          <div><span className="text-muted-foreground">Installation Date:</span> <span className="font-medium">{installDateFormatted}</span></div>
          <div><span className="text-muted-foreground">Coverage Expires:</span> <span className="font-medium">{expirationDate}</span></div>
        </div>

        <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 text-sm max-w-sm mx-auto">
          <p className="font-medium text-primary mb-1">What's Covered</p>
          <p className="text-muted-foreground text-xs">
            All labor costs for repairs related to the original installation are covered
            for {warrantyYears} years from the installation date. No service call fees,
            no diagnostic charges, no labor costs — just call us.
          </p>
        </div>

        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          This warranty is provided by {companyName} and is non-transferable.
          Coverage is subject to the terms and conditions outlined at time of installation.
        </p>
      </div>
    </CertificateTemplate>
  );
}
