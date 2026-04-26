import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { JourneyCanvas } from "@/components/journey/JourneyCanvas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function useJourneyMetrics() {
  return useQuery({
    queryKey: ["journey_metrics"],
    queryFn: async () => {
      const [customers, estimates, jobs, invoices, agreements] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("estimates").select("id, status", { count: "exact" }),
        supabase.from("jobs").select("id, status", { count: "exact" }),
        supabase.from("customer_invoices").select("id, status", { count: "exact" }),
        supabase.from("service_agreements").select("id", { count: "exact", head: true }),
      ]);

      const estData = estimates.data || [];
      const jobData = jobs.data || [];
      const invData = invoices.data || [];

      return {
        leads: customers.count || 0,
        estimates: estData.length,
        won: estData.filter((e: any) => e.status === "won" || e.status === "sold").length,
        jobs: jobData.length,
        invoices: invData.length,
        paid: invData.filter((i: any) => i.status === "paid").length,
        reviews: 0,
        maintenance: agreements.count || 0,
      };
    },
  });
}

export default function CustomerJourney() {
  const isMobile = useIsMobile();
  const { data: metrics, isLoading } = useJourneyMetrics();

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin?tab=tools">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Customer Journey</h1>
            <p className="text-xs text-muted-foreground">Live lifecycle funnel from lead to referral with real metrics.</p>
          </div>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading metrics...</p>}
        {!isLoading && !metrics && (
          <div className="text-center py-16 space-y-3">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">No journey data available yet. Start adding customers to see the lifecycle funnel.</p>
          </div>
        )}
        {metrics && <JourneyCanvas metrics={metrics} />}
      </main>
    </div>
  );
}
