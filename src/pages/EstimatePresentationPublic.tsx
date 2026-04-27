import { useParams } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { QuickCheckoutPresentation } from "@/components/QuickCheckoutPresentation";
import { usePresentationByToken } from "@/hooks/useEstimatePresentations";

export default function EstimatePresentationPublic() {
  const { token } = useParams<{ token: string }>();
  const { data: presentation, isLoading, error } = usePresentationByToken(token);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading estimate...
        </div>
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h1 className="text-xl font-semibold">Estimate link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This estimate link could not be loaded. Please call Carnes and Sons Air Conditioning and we will resend it.
          </p>
        </div>
      </div>
    );
  }

  return <QuickCheckoutPresentation presentation={presentation} estimate={presentation.estimate} />;
}
