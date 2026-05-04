import { CertificateTemplate } from "./CertificateTemplate";
import { BRAND_LOGOS } from "@/data/brandEngineering";
import { format } from "date-fns";

interface WarrantyCertificateProps {
  customerName: string;
  brand: string;
  model: string;
  serialNumber: string;
  installDate: string;
  warrantyYears?: number;
  confirmationNumber?: string;
}

export function WarrantyCertificate({
  customerName, brand, model, serialNumber, installDate,
  warrantyYears = 10, confirmationNumber,
}: WarrantyCertificateProps) {
  const brandLogo = BRAND_LOGOS[brand] || undefined;
  const installDateFormatted = installDate ? format(new Date(installDate), "MMMM d, yyyy") : "—";
  const expirationDate = installDate
    ? format(new Date(new Date(installDate).setFullYear(new Date(installDate).getFullYear() + warrantyYears)), "MMMM d, yyyy")
    : "—";

  return (
    <CertificateTemplate
      title="Manufacturer Warranty Certificate"
      subtitle={`${warrantyYears}-Year Parts Warranty`}
      brandLogo={brandLogo}
    >
      <div className="text-center space-y-6 w-full max-w-lg">
        <p className="text-sm text-muted-foreground">This certifies that</p>
        <p className="text-2xl font-semibold text-primary">{customerName}</p>
        <p className="text-sm text-muted-foreground">
          is covered under a {warrantyYears}-year manufacturer parts warranty for the following equipment:
        </p>

        <div className="grid grid-cols-2 gap-4 text-sm text-left bg-muted/50 rounded-lg p-4">
          <div><span className="text-muted-foreground">Brand:</span> <span className="font-medium">{brand}</span></div>
          <div><span className="text-muted-foreground">Model:</span> <span className="font-medium">{model}</span></div>
          <div><span className="text-muted-foreground">Serial:</span> <span className="font-medium">{serialNumber}</span></div>
          <div><span className="text-muted-foreground">Installed:</span> <span className="font-medium">{installDateFormatted}</span></div>
          <div><span className="text-muted-foreground">Expires:</span> <span className="font-medium">{expirationDate}</span></div>
          {confirmationNumber && (
            <div><span className="text-muted-foreground">Confirmation:</span> <span className="font-medium">{confirmationNumber}</span></div>
          )}
        </div>

        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          This warranty covers all manufacturer-defective parts for the duration specified above.
          Registration has been completed with {brand}.
        </p>
      </div>
    </CertificateTemplate>
  );
}
