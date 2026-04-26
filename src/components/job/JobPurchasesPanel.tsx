import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBag, ExternalLink, Mail, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface Props {
  jobId: string;
}

export function JobPurchasesPanel({ jobId }: Props) {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["job_purchases", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_invoices")
        .select("id, po_number, invoice_number, invoice_date, total_amount, supply_house_id, source, source_ref_id, match_status, match_confidence, supply_houses(name)")
        .eq("job_id", jobId)
        .order("invoice_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const total = (invoices || []).reduce((sum, i: any) => sum + (Number(i.total_amount) || 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Purchases
          </h3>
          {!isLoading && invoices && invoices.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {invoices.length} · ${total.toFixed(2)}
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground italic">
          No supply-house invoices linked to this job yet. Invoices auto-link when the PO number on the receipt matches this job number.
        </div>
      ) : (
        <div className="divide-y">
          {invoices.map((inv: any) => (
            <div key={inv.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {inv.supply_houses?.name || "Unknown vendor"}
                  </span>
                  {inv.po_number && (
                    <Badge variant="outline" className="text-[10px] font-mono">PO #{inv.po_number}</Badge>
                  )}
                  {inv.match_confidence === "high" && (
                    <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
                      Auto-matched
                    </Badge>
                  )}
                  {inv.match_status === "pending" && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                      Needs review
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  {inv.invoice_number && <span>Inv #{inv.invoice_number}</span>}
                  {inv.invoice_date && <span>· {format(new Date(inv.invoice_date), "MMM d, yyyy")}</span>}
                  {inv.source === "email" && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> from email</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {inv.total_amount != null && (
                  <span className="text-sm font-semibold tabular-nums">
                    ${Number(inv.total_amount).toFixed(2)}
                  </span>
                )}
                {inv.source === "email" && inv.source_ref_id && (
                  <Link to={`/inbox?email=${inv.source_ref_id}`}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
