import { CertificateTemplate } from "./CertificateTemplate";
import { BRAND_LOGOS } from "@/data/brandEngineering";
import { format } from "date-fns";
import { useCompanySettings } from "@/hooks/useCompanySettings";

interface NoLemonCertificateProps {
  customerName: string;
  brand: string;
  model: string;
  installDate: string;
}

export function NoLemonCertificate({ customerName, brand, model, installDate }: NoLemonCertificateProps) {
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || "Your HVAC Company";
  const brandLogo = BRAND_LOGOS[brand] || undefined;
  const installDateFormatted = installDate ? format(new Date(installDate), "MMMM d, yyyy") : "—";
  const expirationDate = installDate
    ? format(new Date(new Date(installDate).setFullYear(new Date(installDate).getFullYear() + 1)), "MMMM d, yyyy")
    : "—";

  return (
    <CertificateTemplate
      title="No-Lemon Guarantee"
      subtitle="Your Peace of Mind, Guaranteed"
      brandLogo={brandLogo}
    >
      <div className="text-center space-y-6 w-full max-w-lg">
        <p className="text-sm text-muted-foreground">This guarantees that</p>
        <p className="text-2xl font-semibold text-primary">{customerName}</p>

        <div className="bg-accent/10 border border-accent/20 rounded-lg p-5 text-sm max-w-md mx-auto">
          <p className="text-foreground leading-relaxed">
            If your new system requires <span className="font-bold">3 or more repairs</span> for
            the same issue within the first year of installation, we will{" "}
            <span className="font-bold text-primary">replace the entire unit</span> — no questions asked.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-left bg-muted/50 rounded-lg p-4">
          <div><span className="text-muted-foreground">Brand:</span> <span className="font-medium">{brand}</span></div>
          <div><span className="text-muted-foreground">Model:</span> <span className="font-medium">{model}</span></div>
          <div><span className="text-muted-foreground">Installed:</span> <span className="font-medium">{installDateFormatted}</span></div>
          <div><span className="text-muted-foreground">Guarantee Expires:</span> <span className="font-medium">{expirationDate}</span></div>
        </div>

        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          This guarantee is provided exclusively by {companyName}.
          Most contractors don't offer this — we do because we stand behind our work.
        </p>
      </div>
    </CertificateTemplate>
  );
}
