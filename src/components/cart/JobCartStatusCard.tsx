import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CartViewStatus } from "@/components/cart/CartViewStatus";
import { useJobCart } from "@/hooks/useJobCart";
import { cartToneClasses, getJobCartStatus } from "@/lib/jobCartStatus";
import { cn } from "@/lib/utils";
import { CreditCard, ExternalLink, Send, ShoppingCart } from "lucide-react";

interface Props {
  jobId: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

export function JobCartStatusCard({ jobId, customerName, customerPhone }: Props) {
  const { cart, items, itemCount, sendToCustomer, publicLink } = useJobCart(jobId);
  const statusInfo = getJobCartStatus(cart, itemCount);
  const total = Number(cart?.total || 0);

  const openCart = () => {
    if (publicLink) window.open(publicLink, "_blank", "noopener");
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">{cart?.estimate_number || "Customer Cart"}</h3>
              <Badge className={cn("border", cartToneClasses(statusInfo.tone))}>{statusInfo.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{statusInfo.detail}</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
              <span>${total.toFixed(2)}</span>
              {cart?.id && (
                <CartViewStatus
                  cartId={cart.id}
                  initialFirstViewedAt={cart.first_viewed_at}
                  initialLastViewedAt={cart.last_viewed_at}
                  initialViewCount={cart.view_count || 0}
                  status={cart.status}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {statusInfo.canCollectNow && (
            <Button size="sm" className="h-8 gap-1.5" onClick={openCart} disabled={!publicLink}>
              <CreditCard className="h-3.5 w-3.5" /> Collect Payment
            </Button>
          )}
          {statusInfo.canSendPaymentLink && (
            <Button
              size="sm"
              variant={statusInfo.canCollectNow ? "outline" : "default"}
              className="h-8 gap-1.5"
              onClick={() => sendToCustomer.mutate({ phone: customerPhone, customerName })}
              disabled={!customerPhone || items.length === 0 || sendToCustomer.isPending}
            >
              <Send className="h-3.5 w-3.5" /> {statusInfo.canCollectNow ? "Send Payment Link" : "Send Cart"}
            </Button>
          )}
          {publicLink && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openCart}>
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
