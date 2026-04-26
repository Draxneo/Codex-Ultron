import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function HcpCustomerSyncButton() {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-hcp-customers");
      if (error) throw error;
      // 202 means background processing started
      if (data?.message) {
        toast({ title: "HCP Customer Sync", description: "Sync started — processing in background. Check logs for progress." });
      } else {
        toast({
          title: "HCP Customer Sync",
          description: `Processed ${data?.customers_processed ?? 0} customers, backfilled ${data?.contacts_backfilled ?? 0} contacts, ${data?.addresses_upserted ?? 0} addresses.`,
        });
      }
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={loading}>
      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Syncing Customers…" : "Sync HCP Customers"}
    </Button>
  );
}
