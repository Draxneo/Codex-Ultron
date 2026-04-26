import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

interface Props {
  defaultPaymentMethodId?: string | null;
}

export function PaymentMethodCard({ defaultPaymentMethodId }: Props) {
  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Payment method</h3>
      {defaultPaymentMethodId ? (
        <div className="flex items-center gap-2 text-sm">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-xs">•••• {defaultPaymentMethodId.slice(-4)}</span>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">No payment method on file.</p>
          <Button size="sm" variant="outline" className="w-full">
            Add payment method
          </Button>
        </>
      )}
    </Card>
  );
}
