import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, BookOpen, Wrench, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  jobId: string;
  assignedTo?: string;
}

interface LineItem {
  id: string;
  name: string;
  description?: string | null;
  kind?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at?: string;
}

function ItemTable({ items, title, icon: Icon }: { items: LineItem[]; title: string; icon: React.ElementType }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {title}
        </h4>
        <button className="text-[11px] text-primary hover:underline flex items-center gap-1">
          <BookOpen className="h-3 w-3" /> Price book
        </button>
      </div>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-xs">Item</th>
              <th className="text-right px-3 py-2 font-medium text-xs w-16">Qty</th>
              <th className="text-right px-3 py-2 font-medium text-xs w-24">Unit</th>
              <th className="text-right px-3 py-2 font-medium text-xs w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{item.name}</div>
                  {item.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-line">
                      {item.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{item.quantity}</td>
                <td className="px-3 py-2 text-right">${Number(item.unit_price).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">${Number(item.total_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function JobV2LineItems({ jobId, assignedTo }: Props) {
  const { data: items, isLoading } = useQuery({
    queryKey: ["job_line_items", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_line_items")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as LineItem[];
    },
  });

  const services = (items || []).filter((i) => (i.kind || "").toLowerCase() === "service" || !i.kind);
  const materials = (items || []).filter((i) => (i.kind || "").toLowerCase() === "material" || (i.kind || "").toLowerCase() === "part");
  const subtotal = (items || []).reduce((sum, i) => sum + Number(i.total_price || 0), 0);
  const taxRate = 0.0825;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Line Items</h3>
        <div className="flex items-center gap-2">
          {assignedTo && (
            <button className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary px-2 py-1 rounded border">
              <span>{assignedTo}</span>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          <Button variant="outline" size="sm" className="h-8">+ Add</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items && items.length > 0 ? (
        <>
          <ItemTable items={services} title="Services" icon={Wrench} />
          <ItemTable items={materials} title="Materials" icon={Package} />

          <div className="border-t pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(2)}%)</span>
              <span className="font-medium">${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-1 border-t">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">No line items yet. Click + Add to create one.</p>
      )}
    </Card>
  );
}
