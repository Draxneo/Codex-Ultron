import { CertificateTemplate } from "./CertificateTemplate";

interface PriceMatchCertificateProps {
  customerName: string;
  estimateDate?: string;
}

export function PriceMatchCertificate({ customerName, estimateDate }: PriceMatchCertificateProps) {
  return (
    <CertificateTemplate
      title="Price Match Guarantee"
      subtitle="We Won't Be Beat on Price"
    >
      <div className="text-center space-y-6 w-full max-w-lg">
        <p className="text-sm text-muted-foreground">This certifies that</p>
        <p className="text-2xl font-semibold text-primary">{customerName}</p>

        <div className="bg-accent/10 border border-accent/20 rounded-lg p-5 text-sm max-w-md mx-auto">
          <p className="text-foreground leading-relaxed">
            We will <span className="font-bold text-primary">match any licensed contractor's
            written quote</span> for the same equipment and scope of work, guaranteed.
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2 max-w-sm mx-auto">
          <p className="font-medium text-primary">How It Works</p>
          <ul className="text-left text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>Provide a written quote from any licensed TX contractor</li>
            <li>Quote must be for identical equipment make, model, and tonnage</li>
            <li>Same scope of work (installation, materials, permits)</li>
            <li>We'll match or beat their price — simple as that</li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Valid for 30 days from the date of your estimate.
          {estimateDate && ` Estimate date: ${estimateDate}.`}
        </p>
      </div>
    </CertificateTemplate>
  );
}
