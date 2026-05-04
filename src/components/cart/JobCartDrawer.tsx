import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Plus, Minus, Send, Copy, ExternalLink, Package, Wrench, Zap, Sparkles, AlertCircle, Presentation, CreditCard } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useJobCart, type JobCartItem } from "@/hooks/useJobCart";
import { PaymentOptionStack } from "@/components/pricing/PaymentOptionStack";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";
import { toast } from "sonner";
import { cartToneClasses, getJobCartPermissions, getJobCartStatus } from "@/lib/jobCartStatus";
import { cn } from "@/lib/utils";

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddMore?: () => void;
  customerName?: string | null;
  customerPhone?: string | null;
}

const KIND_ICON: Record<JobCartItem["kind"], React.ComponentType<{ className?: string }>> = {
  equipment: Zap,
  repair: Wrench,
  part: Package,
  custom: Sparkles,
};

const KIND_COLOR: Record<JobCartItem["kind"], string> = {
  equipment: "bg-primary text-primary-foreground",
  repair: "bg-rose-600 text-white",
  part: "bg-amber-300 text-amber-950",
  custom: "bg-violet-600 text-white",
};

export function JobCartDrawer({ jobId, open, onOpenChange, onAddMore, customerName, customerPhone }: Props) {
  const isMobile = useIsMobile();
  const { cart, items, itemCount, updateItem, removeItem, sendToCustomer, publicLink, presentLink } = useJobCart(jobId);
  const statusInfo = getJobCartStatus(cart, itemCount);
  const permissions = getJobCartPermissions(cart, itemCount);
  const total = Number(cart?.total || 0);
  const canSend = permissions.canSendForApproval || permissions.canSendPaymentLink;
  const sendDisabled = !canSend || sendToCustomer.isPending || !customerPhone;
  const customerFirstName = customerName?.split(" ")[0] || "the customer";

  const copyLink = () => {
    if (!publicLink) return;
    navigator.clipboard.writeText(publicLink);
    toast.success("Link copied");
  };

  const body = (
    <div className="flex flex-col h-full">
      {/* Header info */}
      <div className="px-4 pt-2 pb-3 border-b">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
          <Badge className={cn("border", cartToneClasses(statusInfo.tone))}>{statusInfo.label}</Badge>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-24">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Customer cart is empty</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onAddMore} disabled={!permissions.canEditItems}>
              <Plus className="h-4 w-4 mr-1" /> Add Items
            </Button>
          </div>
        ) : (
          items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <Card key={item.id} className="p-3 flex gap-3">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-16 w-16 rounded object-cover bg-muted shrink-0" />
                ) : (
                  <div className={`h-16 w-16 rounded flex items-center justify-center shrink-0 ${KIND_COLOR[item.kind]}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">{item.name}</p>
                      {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeItem.mutate(item.id)} disabled={!permissions.canEditItems}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItem.mutate({ id: item.id, quantity: Math.max(1, Number(item.quantity) - 1) })} disabled={!permissions.canEditItems}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium w-7 text-center">{Number(item.quantity)}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItem.mutate({ id: item.id, quantity: Number(item.quantity) + 1 })} disabled={!permissions.canEditItems}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="font-bold text-sm">${Number(item.total_price).toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Sticky footer */}
      <div className="absolute inset-x-0 bottom-0 bg-background border-t p-3 space-y-2 z-10 max-h-[60%] overflow-y-auto">
        {(() => {
          const hasEquipment = items.some((i) => i.kind === "equipment");
          const total = Number(cart?.total || 0);
          if (total < 1500 && !hasEquipment) return null;
          const rebatePrice = hasEquipment ? Math.round(total * 0.92 * 100) / 100 : total;
          return (
            <PaymentOptionStack
              financed={total}
              monthly36={calcMonthly36(total) ?? 0}
              monthly120={calcMonthly120(total) ?? 0}
              rebatePrice={rebatePrice}
              compact
            />
          );
        })()}
        <div className="space-y-0.5 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${Number(cart?.subtotal || 0).toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Tax ({((cart?.tax_rate || 0) * 100).toFixed(2)}%)</span><span>${Number(cart?.tax_amount || 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total</span><span>${total.toFixed(2)}</span></div>
        </div>
        <div className={cn(
          "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
          customerPhone ? "bg-muted/40 text-muted-foreground" : "bg-destructive/5 text-destructive border-destructive/30",
        )}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {customerPhone
              ? `Sending texts ${customerFirstName} a private link with these ${itemCount} item${itemCount !== 1 ? "s" : ""} and the $${total.toFixed(2)} total.`
              : "Customer phone is missing. Copy or present the link, or add a phone number before sending SMS."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {permissions.canEditItems && (
            <Button variant="outline" className="h-12" onClick={onAddMore}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          )}
          <Button variant="outline" className="h-12" onClick={copyLink} disabled={!publicLink}>
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          <Button variant="outline" className="h-12" onClick={() => presentLink && window.open(presentLink, "_blank", "noopener")} disabled={!presentLink}>
            <Presentation className="h-4 w-4 mr-1" /> Present
          </Button>
          {statusInfo.canCollectNow && (
            <Button className="h-12" onClick={() => publicLink && window.open(publicLink, "_blank", "noopener")} disabled={!publicLink}>
              <CreditCard className="h-4 w-4 mr-1" /> Collect
            </Button>
          )}
          {publicLink && (
            <Button variant="outline" className="h-12" asChild>
              <a href={publicLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Open</a>
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            className="h-14 flex-1 text-base"
            disabled={sendDisabled}
            onClick={() => sendToCustomer.mutate({ phone: customerPhone, customerName })}
          >
            <Send className="h-5 w-5 mr-2" /> {sendToCustomer.isPending ? "Sending..." : permissions.canSendPaymentLink && !permissions.canSendForApproval ? "Send Payment Link" : "Send to Customer"}
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" /> {cart?.estimate_number || "Customer Cart"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="relative flex-1 min-h-0">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> {cart?.estimate_number || "Customer Cart"}</SheetTitle>
        </SheetHeader>
        <div className="relative flex-1 min-h-0">{body}</div>
      </SheetContent>
    </Sheet>
  );
}