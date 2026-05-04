import { Navigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { PaysheetPanel } from "@/components/PaysheetPanel";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

export default function TechPay() {
  const { role, loading } = useEffectiveAuth();

  if (loading) return null;

  if (role === "admin") {
    return <Navigate to="/admin?section=employees&employeeTab=pay" replace />;
  }

  return (
    <main className="min-h-screen bg-background px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal text-foreground">This week's pay</h1>
              <p className="text-sm text-muted-foreground">
                Current-week pay entries tied to your employee profile.
              </p>
            </div>
          </div>
        </header>

        <PaysheetPanel technicianOnly lockToCurrentWeek />
      </div>
    </main>
  );
}
