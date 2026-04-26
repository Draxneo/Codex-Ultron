import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  customerId: string;
  enabled: boolean;
}

export function AutoInvoiceCard({ customerId, enabled }: Props) {
  const qc = useQueryClient();
  const toggle = async (v: boolean) => {
    await supabase.from("customers").update({ auto_invoice_enabled: v }).eq("id", customerId);
    qc.invalidateQueries({ queryKey: ["customer-overview", customerId] });
  };

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Auto invoice</h3>
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-invoice" className="text-sm font-normal cursor-pointer">
          Auto-bill on completion
        </Label>
        <Switch id="auto-invoice" checked={enabled} onCheckedChange={toggle} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Automatically send invoice when job is marked complete.
      </p>
    </Card>
  );
}
