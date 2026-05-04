import { useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useCertificateByToken } from "@/hooks/useCertificates";
import { useCertificateTemplateByKey } from "@/hooks/useCertificateTemplates";
import { DynamicCertificate } from "@/components/certificates/DynamicCertificate";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function CertificateView() {
  const { token } = useParams<{ token: string }>();
  const { data: cert, isLoading } = useCertificateByToken(token);
  const { data: template, isLoading: templateLoading } = useCertificateTemplateByKey(cert?.certificate_type);

  if (isLoading || templateLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Skeleton className="w-96 h-64" /></div>;
  }
  if (!cert || !template) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground bg-background">Certificate not found.</div>;
  }

  return (
    <div className="min-h-screen bg-muted py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-end mb-4 gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="w-4 h-4 mr-1" /> Print / Save PDF
          </Button>
        </div>
        <div className="shadow-xl rounded-lg overflow-hidden print:shadow-none">
          <DynamicCertificate template={template} data={cert.data_snapshot || {}} />
        </div>
      </div>
    </div>
  );
}
