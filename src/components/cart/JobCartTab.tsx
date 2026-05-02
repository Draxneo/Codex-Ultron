import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ShoppingCart, Plus, Send, Copy, ExternalLink, Trash2, Package, Wrench, Zap, Sparkles } from "lucide-react";
import { useJobCart, type JobCartItem } from "@/hooks/useJobCart";
import { JobCartPicker } from "@/components/cart/JobCartPicker";
import { JobCartDrawer } from "@/components/cart/JobCartDrawer";
import { CartAddonSuggestions } from "@/components/cart/CartAddonSuggestions";
import { PromoCodeField } from "@/components/cart/PromoCodeField";
import { CartViewStatus } from "@/components/cart/CartViewStatus";
import { PaymentOptionStack } from "@/components/pricing/PaymentOptionStack";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GoodBetterBestPicker } from "@/components/tiers/GoodBetterBestPicker";
import { TierPresetManager } from "@/components/tiers/TierPresetManager";
import { useAuth } from "@/hooks/useAuth";
import { cartToneClasses, getJobCartPermissions, getJobCartStatus } from "@/lib/jobCartStatus";
import { cn } from "@/lib/utils";

const CART_TIER_SCOPE = "cart_install_addon";

interface Props {
  jobId: string;
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

export function JobCartTab({ jobId, customerName, customerPhone }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tierManagerOpen, setTierManagerOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { cart, items, itemCount, removeItem, sendToCustomer, syncBackupToHcp, publicLink, isLoading, addItem } = useJobCart(jobId);
  const statusInfo = getJobCartStatus(cart, itemCount);
  const permissions = getJobCartPermissions(cart, itemCount);

  const copyLink = () => {
    if (!publicLink) return;
    navigator.clipboard.writeText(publicLink);
    toast.success("Link copied");
  };

  const applyPromo = async (code: string, amount: number) => {
    if (!cart?.id) return;
    if (!permissions.canApplyPromo) {
      toast.error(permissions.lockedReason || "This estimate cannot be changed.");
      return;
    }
    const { error } = await (supabase as any)
      .from("job_carts")
      .update({ discount_code: code, discount_amount: amount })
      .eq("id", cart.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["job_cart", jobId] });
  };

  const removePromo = async () => {
    if (!cart?.id) return;
    if (!permissions.canApplyPromo) {
      toast.error(permissions.lockedReason || "This estimate cannot be changed.");
      return;
    }
    await (supabase as any).from("job_carts").update({ discount_code: null, discount_amount: 0 }).eq("id", cart.id);
    queryClient.invalidateQueries({ queryKey: ["job_cart", jobId] });
  };

  if (isLoading) return <p className="text-center text-muted-foreground py-8 text-sm">Loading estimate...</p>;

  const discountAmount = Number((cart as any)?.discount_amount || 0);
  const discountCode = (cart as any)?.discount_code as string | null;

  return (
    <div className="p-4 space-y-4">
      {/* Estimate status header */}
      <Card className="p-4 flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-bold text-lg">{cart?.estimate_number || "Estimate"} · ${Number(cart?.total || 0).toFixed(2)}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge className={cn("border text-[10px]", cartToneClasses(statusInfo.tone))}>{statusInfo.label}</Badge>
              {permissions.lockedReason && <span className="text-[11px] text-muted-foreground">{permissions.lockedReason}</span>}
            </div>
            <p className="text-xs text-muted-foreground">{itemCount} item{itemCount !== 1 ? "s" : ""} • {cart?.status || "draft"}</p>
            {cart?.id && (
              <CartViewStatus
                cartId={cart.id}
                initialFirstViewedAt={(cart as any).first_viewed_at}
                initialLastViewedAt={(cart as any).last_viewed_at}
                initialViewCount={(cart as any).view_count || 0}
                status={cart.status}
              />
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setPickerOpen(true)} size="sm" disabled={!permissions.canEditItems}>
            <Plus className="h-4 w-4 mr-1" /> Add Items
          </Button>
          <Button
            onClick={() => sendToCustomer.mutate({ phone: customerPhone, customerName })}
            size="sm"
            variant="default"
            disabled={(!permissions.canSendForApproval && !permissions.canSendPaymentLink) || sendToCustomer.isPending}
          >
            <Send className="h-4 w-4 mr-1" /> {permissions.canSendPaymentLink && !permissions.canSendForApproval ? "Send Payment Link" : "Send"}
          </Button>
        </div>
      </Card>

      {/* Public link bar */}
      {publicLink && (
        <Card className="p-3 flex items-center gap-2 bg-muted/40">
          <code className="text-xs flex-1 truncate text-muted-foreground">{publicLink}</code>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={publicLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
          </Button>
        </Card>
      )}

      {itemCount > 0 && (
        <Card className="p-3 flex flex-col gap-2 border-amber-500/25 bg-amber-500/5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-foreground">Emergency backup</p>
              <p className="text-xs text-muted-foreground">
                Copies this itemized estimate to the Housecall Pro job note if Stripe or the cart gives you trouble.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => syncBackupToHcp.mutate()}
            disabled={syncBackupToHcp.isPending}
          >
            {syncBackupToHcp.isPending ? "Copying..." : "Copy to HCP"}
          </Button>
        </Card>
      )}

      {/* Good / Better / Best equipment quick-add */}
      {permissions.canEditItems && <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="font-bold text-sm">Add Equipment Package</p>
            <Badge variant="outline" className="text-[10px]">Good · Better · Best</Badge>
          </div>
          {user && (
            <Button size="sm" variant="ghost" onClick={() => setTierManagerOpen(true)}>
              Curate
            </Button>
          )}
        </div>
        <GoodBetterBestPicker
          scope={CART_TIER_SCOPE}
          ctaLabel="Add to Estimate"
          onSelect={(m, tier) => {
            const price = Number(m.factory_rebate_price ?? m.total_price ?? 0);
            addItem.mutate({
              kind: "equipment",
              source_id: m.id,
              name: `${m.brand} ${m.tonnage}T ${m.tier} (${tier.toUpperCase()})`,
              description: `${m.system_type ?? ""} · SEER2 ${m.seer2 ?? "—"}${m.afue ? ` · AFUE ${m.afue}%` : ""}`,
              image_url: null,
              unit_price: price,
              quantity: 1,
            });
          }}
        />
      </Card>}

      {/* Items list */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">No items yet. Build the customer's Estimate from the catalog.</p>
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add First Item
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <Card key={item.id} className="p-3 flex gap-3 items-center">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-14 w-14 rounded object-cover bg-muted shrink-0" />
                ) : (
                  <div className={`h-14 w-14 rounded flex items-center justify-center shrink-0 ${KIND_COLOR[item.kind]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] capitalize">{item.kind}</Badge>
                    <span className="text-xs text-muted-foreground">{Number(item.quantity)} × ${Number(item.unit_price).toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">${Number(item.total_price).toFixed(2)}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeItem.mutate(item.id)} disabled={!permissions.canEditItems}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}

          {/* Add-on suggestions */}
          {permissions.canEditItems && <CartAddonSuggestions
            itemKinds={items.map((i) => i.kind)}
            itemNames={items.map((i) => i.name)}
            onAdd={(rule) => addItem.mutate({
              kind: rule.suggestion_kind,
              source_id: rule.suggestion_source_id ?? null,
              name: rule.name,
              description: rule.description,
              image_url: rule.image_url,
              unit_price: Number(rule.unit_price),
              metadata: { from_addon_rule: rule.id, badge: rule.badge },
            })}
            variant="tech"
          />}

          {/* Promo code */}
          {permissions.canApplyPromo && <Card className="p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Promo Code</p>
            <PromoCodeField
              subtotal={Number(cart?.subtotal || 0)}
              appliedCode={discountCode}
              appliedAmount={discountAmount}
              onApply={applyPromo}
              onRemove={removePromo}
              compact
            />
          </Card>}

          {/* A/B/C payment framing - mirrors what the customer sees on the public Estimate */}
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

          {/* Totals */}
          <Card className="p-4 mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${Number(cart?.subtotal || 0).toFixed(2)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount {discountCode && `(${discountCode})`}</span>
                <span>−${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground"><span>Tax ({((cart?.tax_rate || 0) * 100).toFixed(2)}%)</span><span>${Number(cart?.tax_amount || 0).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>${Number(cart?.total || 0).toFixed(2)}</span></div>
          </Card>
        </div>
      )}

      <JobCartPicker
        jobId={jobId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onOpenCart={() => setDrawerOpen(true)}
        customerName={customerName}
        customerPhone={customerPhone}
      />
      <JobCartDrawer
        jobId={jobId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onAddMore={() => { setDrawerOpen(false); setPickerOpen(true); }}
        customerName={customerName}
        customerPhone={customerPhone}
      />
      <TierPresetManager
        scope={CART_TIER_SCOPE}
        scopeLabel="Job Estimate - Equipment Add-on"
        open={tierManagerOpen}
        onOpenChange={setTierManagerOpen}
      />
    </div>
  );
}
