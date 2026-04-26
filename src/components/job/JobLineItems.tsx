import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign } from "lucide-react";

function LineItemDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 150;
  return (
    <p className={`mt-0.5 text-[11px] leading-snug text-muted-foreground whitespace-pre-line ${!expanded && isLong ? "line-clamp-2" : ""}`}>
      {text}
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="ml-1 text-primary hover:underline font-medium inline">
          {expanded ? "less" : "more"}
        </button>
      )}
    </p>
  );
}

export function JobLineItems({ jobId }: { jobId: string }) {
  const { data: lineItems, isLoading } = useQuery({
    queryKey: ["job_line_items", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_line_items")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return null;
  if (!lineItems || lineItems.length === 0) return null;

  const total = lineItems.reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);

  return (
    <div className="p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" /> Line Items
      </h3>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium">Item</th>
              <th className="text-right p-2 font-medium w-12">Qty</th>
              <th className="text-right p-2 font-medium w-20">Unit</th>
              <th className="text-right p-2 font-medium w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item: any) => (
              <tr key={item.id} className="border-t border-border/50">
                <td className="p-2">
                  <div>
                    <span className="font-medium">{item.name}</span>
                    {item.kind && <span className="ml-1 text-muted-foreground">({item.kind})</span>}
                  </div>
                  {item.description && <LineItemDescription text={item.description} />}
                </td>
                <td className="text-right p-2">{item.quantity}</td>
                <td className="text-right p-2">${Number(item.unit_price).toFixed(2)}</td>
                <td className="text-right p-2 font-medium">${Number(item.total_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td colSpan={3} className="p-2 text-right font-semibold">Total</td>
              <td className="p-2 text-right font-bold">${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
