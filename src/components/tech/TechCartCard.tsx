/**
 * TechCartCard - mobile customer cart for the tech job detail page.
 *
 * Techs add repair/equipment options here, send the customer approval/payment
 * link, and watch the card update as the customer views, approves, declines,
 * or pays.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Plus,
  Send,
  Trash2,
  Package,
  Wrench,
  Zap,
  Sparkles,
  X,
  Check,
  Presentation,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  MessageSquareText,
  Crown,
  BadgePercent,
} from "lucide-react";
import { useJobCart, type JobCartItem } from "@/hooks/useJobCart";
import { useComfortClubCartSummary } from "@/hooks/useComfortClubCart";
import { JobCartPicker } from "@/components/cart/JobCartPicker";
import { JobCartDrawer } from "@/components/cart/JobCartDrawer";
import { CartAddonSuggestions } from "@/components/cart/CartAddonSuggestions";
import { CartViewStatus } from "@/components/cart/CartViewStatus";
import { cn } from "@/lib/utils";
import { cartToneClasses, getJobCartPermissions, getJobCartStatus } from "@/lib/jobCartStatus";
import { formatDistanceToNow } from "date-fns";

interface Props {
  jobId: string;
  customerId?: string | null;
  customerPhone: string | null;
  customerName: string | null;
  bare?: boolean;
  focused?: boolean;
}

const KIND_ICON: Record<JobCartItem["kind"], typeof Package> = {
  equipment: Package,
  repair: Wrench,
  part: Zap,
  custom: Sparkles,
};

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;

export function TechCartCard({ jobId, customerId, customerPhone, customerName, bare = false, focused = false }: Props) {
  const { cart, items, itemCount, addItem, removeItem, sendToCustomer, publicLink, presentLink } = useJobCart(jobId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const total = Number(cart?.total ?? 0) || 0;
  const equipmentItems = items.filter((item) => item.kind === "equipment");
  const primaryEquipment = equipmentItems[0] || null;
  const primaryMeta = (primaryEquipment?.metadata || {}) as Record<string, any>;
  const status = (cart as any)?.status || "draft";
  const firstViewedAt = (cart as any)?.first_viewed_at;
  const lastViewedAt = (cart as any)?.last_viewed_at;
  const statusInfo = getJobCartStatus(cart, itemCount);
  const permissions = getJobCartPermissions(cart, itemCount);
  const customerFirstName = customerName?.split(" ")[0] || "the customer";
  const customerTarget = customerPhone || "No customer phone";
  const sendDisabled = sendToCustomer.isPending || !customerPhone;
  const memberInfo = useComfortClubCartSummary(customerId, {
    cartSubtotal: Number((cart as any)?.discount_eligible_subtotal || (cart as any)?.subtotal || 0),
    actualDiscountAmount: Number((cart as any)?.comfort_club_discount_amount || 0),
    items,
  });

  const handleAddCustom = () => {
    const price = parseFloat(customPrice);
    if (!customName.trim() || isNaN(price)) return;
    addItem.mutate({ kind: "custom", name: customName.trim(), unit_price: price, quantity: 1 });
    setCustomName("");
    setCustomPrice("");
    setCustomOpen(false);
  };

  const handleSend = () => {
    if (!customerPhone) return;
    sendToCustomer.mutate({ phone: customerPhone, customerName });
  };

  const handlePresent = () => {
    if (presentLink) window.location.assign(presentLink);
  };

  const handleCollectPayment = () => {
    if (publicLink) window.open(publicLink, "_blank", "noopener");
  };

  // ── Status-driven action row ──────────────────────────────────────
  const renderSendGuard = (label = "SMS link") => (
    <div className={cn(
      "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
      customerPhone ? "bg-emerald-500/5 border-emerald-500/20 text-muted-foreground" : "bg-destructive/5 border-destructive/30 text-destructive",
    )}>
      {customerPhone ? <MessageSquareText className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
      <div className="leading-snug">
        <p className="font-semibold text-foreground">
          {customerPhone ? `${label} will go to ${customerFirstName}` : "Add a customer phone before sending"}
        </p>
        <p>{customerPhone ? customerTarget : "You can still present or copy the link, but SMS cannot send yet."}</p>
      </div>
    </div>
  );

  const renderFocusedCart = () => (
    <>
      <div className="space-y-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sales presentation</p>
              <h2 className="mt-1 text-xl font-bold text-foreground">
                {primaryEquipment ? primaryEquipment.name : "Build the comfort story"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {primaryEquipment
                  ? "The cart is attached below for approval and payment."
                  : `Start with the system pitch, then attach the cart for ${customerName || "the customer"}.`}
              </p>
            </div>
            <Badge className={cn("border", cartToneClasses(statusInfo.tone))}>{statusInfo.label}</Badge>
          </div>
        </Card>

        <Card className="overflow-hidden border-primary/20 bg-background">
          <div className="border-b bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Presentation className="h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">Presentation first</p>
            </div>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Sell comfort, reliability, peace of mind, and efficiency here. The cart only confirms what they chose.
            </p>
          </div>
          {primaryEquipment ? (
            <div className="space-y-4 p-4">
              <div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Customer-ready pitch</Badge>
                <h3 className="mt-2 text-lg font-bold leading-tight text-foreground">{primaryEquipment.name}</h3>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                  {primaryEquipment.description || "A matched comfort system with a clean install, warranty support, and paperwork handled."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {buildTechPresentationBenefits(primaryEquipment).map((benefit) => (
                  <div key={benefit.title} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-semibold leading-tight text-foreground">{benefit.title}</p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{benefit.body}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  primaryMeta.seer2 ? { label: "SEER2", value: primaryMeta.seer2 } : null,
                  primaryMeta.eer2 ? { label: "EER2", value: primaryMeta.eer2 } : null,
                  primaryMeta.cps_rebate_tier ? { label: "CPS", value: primaryMeta.cps_rebate_tier } : null,
                ].filter(Boolean).map((spec: any) => (
                  <div key={spec.label} className="rounded-md bg-primary/5 px-2 py-2 text-center ring-1 ring-primary/10">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{spec.label}</p>
                    <p className="mt-0.5 truncate text-xs font-bold text-foreground">{spec.value}</p>
                  </div>
                ))}
              </div>
              {Number(primaryMeta.early_rebate || primaryMeta.burnout_rebate || 0) > 0 && (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    CPS estimate: up to {money(Math.max(Number(primaryMeta.early_rebate || 0), Number(primaryMeta.burnout_rebate || 0)))}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    Present as estimated and subject to CPS Energy approval.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center">
                <p className="text-sm font-semibold text-foreground">No system presentation yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Tap Build Presentation and select brand, tonnage, type, tier, and location.</p>
              </div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button className="h-14 gap-2 text-sm" onClick={() => setPickerOpen(true)} disabled={!permissions.canEditItems}>
            <Plus className="h-4 w-4" /> Build Presentation
          </Button>
          {presentLink ? (
            <a
              href={presentLink}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Eye className="h-4 w-4" /> Customer View
            </a>
          ) : (
            <Button variant="outline" className="h-14 gap-2 text-sm" disabled>
              <Eye className="h-4 w-4" /> Customer View
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <Card className="p-6 text-center">
            <ShoppingCart className="mx-auto mb-2 h-10 w-10 text-muted-foreground/35" />
            <p className="text-sm font-semibold text-foreground">No presentation/cart items yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Start with a system presentation, then add repairs or add-ons as needed.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind] || Package;
              return (
                <Card key={item.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight text-foreground">{item.name}</p>
                      {item.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">Qty {item.quantity} - {money(Number(item.unit_price))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-foreground">{money(Number(item.total_price))}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem.mutate(item.id)}
                        disabled={!permissions.canEditItems}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {customOpen && (
          <Card className="p-3 space-y-2">
            <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Custom item name" />
            <Input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} type="number" inputMode="decimal" placeholder="Price" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setCustomOpen(false)}>Cancel</Button>
              <Button onClick={handleAddCustom} disabled={!customName.trim() || !customPrice}>Add</Button>
            </div>
          </Card>
        )}

        <Button variant="outline" className="h-12 w-full gap-2" onClick={() => setCustomOpen((v) => !v)} disabled={!permissions.canEditItems}>
          <Sparkles className="h-4 w-4" /> Add Custom Cart Item
        </Button>

        <Card className="p-3 space-y-3">
          {renderSendGuard(permissions.canSendPaymentLink && !permissions.canSendForApproval ? "Payment link" : "Estimate link")}
          <Button
            className="h-14 w-full gap-2 text-base"
            onClick={handleSend}
            disabled={sendDisabled || itemCount === 0 || (!permissions.canSendForApproval && !permissions.canSendPaymentLink)}
          >
            <Send className="h-5 w-5" /> {sendToCustomer.isPending ? "Sending..." : permissions.canSendPaymentLink && !permissions.canSendForApproval ? "Send Payment Link" : "Send to Customer"}
          </Button>
          <Button variant="outline" className="h-12 w-full gap-2" onClick={handleCollectPayment} disabled={!publicLink || !statusInfo.canCollectNow}>
            <CreditCard className="h-4 w-4" /> Collect Payment
          </Button>
        </Card>
      </div>

      <JobCartPicker
        jobId={jobId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onOpenCart={() => setDrawerOpen(true)}
        customerPhone={customerPhone}
        customerName={customerName}
      />
      <JobCartDrawer
        jobId={jobId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onAddMore={() => {
          setDrawerOpen(false);
          setPickerOpen(true);
        }}
        customerPhone={customerPhone}
        customerName={customerName}
      />
    </>
  );

  if (focused) return renderFocusedCart();

  const renderActionRow = () => {
    if (itemCount === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <div>
            <p className="text-sm font-semibold leading-tight">Add one option to start.</p>
            <p className="text-xs text-muted-foreground leading-tight">Nothing sends until you tap send.</p>
          </div>
        </div>
      );
    }

    if (status === "paid") {
      return (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 h-9 px-3 text-sm">
            <CheckCircle2 className="h-4 w-4" /> Paid - {money(total)}
          </Badge>
          <p className="mt-2 text-xs text-muted-foreground">This customer cart is locked because payment was collected.</p>
        </div>
      );
    }

    if (status === "approved") {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Badge className={cn("gap-1.5 h-9 px-3 text-sm border", cartToneClasses(statusInfo.tone))}>
              <CheckCircle2 className="h-4 w-4" /> {statusInfo.label}
            </Badge>
            <p className="flex-1 text-xs text-muted-foreground leading-snug">{statusInfo.detail}</p>
          </div>
          {statusInfo.canSendPaymentLink && renderSendGuard("Payment link")}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {statusInfo.canCollectNow && (
              <Button className="h-11 text-sm gap-2" onClick={handleCollectPayment} disabled={!publicLink}>
                <CreditCard className="h-4 w-4" /> Collect Payment
              </Button>
            )}
            {statusInfo.canSendPaymentLink && (
              <Button
                variant="outline"
                className="h-11 text-sm gap-2"
                onClick={handleSend}
                disabled={sendDisabled}
              >
                <Send className="h-4 w-4" /> {sendToCustomer.isPending ? "Sending..." : "Send Payment Link"}
              </Button>
            )}
            <Button variant="outline" className="h-11 text-sm gap-2" onClick={handlePresent} disabled={!presentLink}>
              <Presentation className="h-4 w-4" /> Present
            </Button>
          </div>
        </div>
      );
    }

    if (status === "declined") {
      return (
        <div className="space-y-3">
          <Badge variant="destructive" className="gap-1.5 h-9 px-3 text-sm">
            <X className="h-4 w-4" /> Declined
          </Badge>
          <p className="text-xs text-muted-foreground">Revise the customer options, then resend when the customer is ready.</p>
          {renderSendGuard("Revised estimate")}
          <Button className="h-14 w-full text-sm gap-2" onClick={handleSend} disabled={sendDisabled}>
            <RefreshCw className="h-4 w-4" /> {sendToCustomer.isPending ? "Sending..." : "Revise & Resend"}
          </Button>
        </div>
      );
    }

    if (status === "sent") {
      const viewed = !!firstViewedAt;
      const pillText = viewed
        ? `Viewed ${formatDistanceToNow(new Date(lastViewedAt || firstViewedAt))} ago`
        : "Sent - waiting";
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Badge variant="secondary" className="gap-1.5 h-9 px-3 text-sm">
              {viewed ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />} {pillText}
            </Badge>
            <p className="flex-1 text-xs text-muted-foreground leading-snug">
              {viewed ? "Customer has opened the link. Present it in person or resend if they cannot find it." : "Customer has the link. Waiting for them to open and choose an option."}
            </p>
          </div>
          {renderSendGuard("Estimate link")}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11 text-sm gap-2"
              onClick={handleSend}
              disabled={sendDisabled}
            >
              <RefreshCw className="h-4 w-4" /> {sendToCustomer.isPending ? "Sending..." : "Resend"}
            </Button>
            <Button className="h-11 text-sm gap-2" onClick={handlePresent} disabled={!presentLink}>
              <Presentation className="h-4 w-4" /> Present
            </Button>
          </div>
        </div>
      );
    }

    // draft (with items)
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Badge className={cn("gap-1.5 h-9 px-3 text-sm border", cartToneClasses(statusInfo.tone))}>
            <ShoppingCart className="h-4 w-4" /> Ready to send
          </Badge>
          <p className="flex-1 text-xs text-muted-foreground leading-snug">
            Customer will receive a private link to review, approve, pay now, choose financing, or approve scope only.
          </p>
        </div>
        {renderSendGuard("Estimate link")}
        <Button
          className="h-12 w-full text-sm gap-2"
          onClick={handleSend}
          disabled={sendDisabled}
        >
          <Send className="h-4 w-4" />
          {sendToCustomer.isPending ? "Sending..." : "Send Cart for Approval"}
        </Button>
        <Button variant="outline" className="h-11 w-full text-sm gap-2" onClick={handlePresent} disabled={!presentLink}>
          <Presentation className="h-4 w-4" /> Present on this phone first
        </Button>
      </div>
    );
  };

  const renderComfortClub = () => {
    if (!customerId) return null;

    const savings = memberInfo.displayedSavings;
    const planPrice = memberInfo.planSource === "install_included"
      ? "Included with install"
      : `$${memberInfo.planAnnualPrice.toFixed(0)}/year`;
    const visiblePerks = memberInfo.perks.slice(0, 2);

    if (memberInfo.isLoading) {
      return (
        <div className="px-3 py-2 border-b border-border">
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
        </div>
      );
    }

    if (memberInfo.isActive) {
      return (
        <div className="px-3 py-2 border-b border-border bg-emerald-500/5">
          <div className="rounded-lg border border-emerald-500/25 bg-background p-2.5">
            <div className="flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Crown className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground leading-tight">Comfort Club member</p>
                  {savings > 0 && (
                    <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                      -{money(savings)}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                  {memberInfo.planName} gives this customer {memberInfo.discountPercent}% member pricing.
                </p>
                {visiblePerks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {visiblePerks.map((perk) => (
                      <span key={perk} className="max-w-full rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-emerald-700 dark:text-emerald-400 line-clamp-1">
                        {perk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="px-3 py-2 border-b border-border bg-amber-500/5">
        <div className="rounded-lg border border-amber-500/25 bg-background p-2.5">
          <div className="flex items-start gap-2.5">
            <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
              <BadgePercent className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground leading-tight">Offer Comfort Club</p>
                <Badge variant="outline" className="shrink-0 text-[10px]">{planPrice}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                {savings > 0
                  ? `Potential member savings: $${savings.toFixed(2)}.`
                  : `${memberInfo.planName} adds member pricing and service perks.`}
              </p>
              {visiblePerks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {visiblePerks.map((perk) => (
                    <span key={perk} className="max-w-full rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-700 dark:text-amber-400 line-clamp-1">
                      {perk}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const inner = (
    <>
      {!bare && (
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-muted/30">
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">{cart?.estimate_number || "Customer Cart"}</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {itemCount} item{itemCount !== 1 ? "s" : ""} - {money(total)}
            </p>
          </div>
        </div>
      )}

      {bare && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-amber-500/5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Customer options</p>
            <p className="text-xs text-muted-foreground">
              {itemCount} item{itemCount !== 1 ? "s" : ""} - {money(total)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={() => setDrawerOpen(true)}
            disabled={!cart}
          >
            Review
          </Button>
        </div>
      )}

      {/* Status-driven action row */}
      <div className="px-3 py-2.5 border-b border-border bg-muted/10">{renderActionRow()}</div>

      {renderComfortClub()}

      {/* View status */}
      {cart?.id && status !== "draft" && (
        <div className="px-4 py-2 border-b border-border bg-muted/10">
          <CartViewStatus
            cartId={cart.id}
            initialFirstViewedAt={firstViewedAt}
            initialLastViewedAt={lastViewedAt}
            initialViewCount={(cart as any).view_count || 0}
            status={status}
          />
        </div>
      )}

      {/* Items */}
      {items.length > 0 ? (
        <div>
          <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer will see</p>
            <p className="text-xs font-bold">{money(total)}</p>
          </div>
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind] || Package;
              return (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      qty {item.quantity} - {money(Number(item.unit_price))}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {money(Number(item.total_price))}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem.mutate(item.id)}
                    className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted"
                    aria-label="Remove"
                    disabled={status === "approved" || status === "paid"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="px-3 py-3">
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-center">
            <p className="text-xs text-muted-foreground">No items yet. Add from pricebook or create custom.</p>
          </div>
        </div>
      )}

      {customOpen && (
        <div className="border-t border-border bg-muted/20 px-3 py-2.5 flex items-center gap-2">
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Item name"
            className="h-9 text-sm flex-1"
            autoFocus
          />
          <Input
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            type="number"
            inputMode="decimal"
            placeholder="$0.00"
            className="h-9 text-sm w-24"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!customName.trim() || !customPrice}
            className={cn(
              "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
              customName.trim() && customPrice
                ? "bg-primary text-primary-foreground active:scale-95"
                : "bg-muted text-muted-foreground/40",
            )}
            aria-label="Save"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomOpen(false);
              setCustomName("");
              setCustomPrice("");
            }}
            className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted shrink-0"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add row — disabled once customer has approved/paid */}
      {permissions.canEditItems && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-10 text-sm gap-1.5"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Pricebook
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-10 text-sm gap-1.5"
            onClick={() => setCustomOpen((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" /> Custom
          </Button>
        </div>
      )}

      {items.length > 0 && permissions.canEditItems && (
        <div className="border-t border-border px-3 py-2">
          <CartAddonSuggestions
            itemKinds={items.map((i) => i.kind)}
            itemNames={items.map((i) => i.name)}
            onAdd={(s) =>
              addItem.mutate({
                kind: (s.suggestion_kind as JobCartItem["kind"]) || "custom",
                name: s.name,
                description: s.description,
                image_url: s.image_url,
                unit_price: s.unit_price,
              })
            }
            variant="tech"
            maxShown={4}
          />
        </div>
      )}
    </>
  );

  return (
    <>
      {bare ? inner : <Card className="overflow-hidden">{inner}</Card>}

      <JobCartPicker
        jobId={jobId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onOpenCart={() => setDrawerOpen(true)}
        customerPhone={customerPhone}
        customerName={customerName}
      />
      <JobCartDrawer
        jobId={jobId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onAddMore={() => {
          setDrawerOpen(false);
          setPickerOpen(true);
        }}
        customerPhone={customerPhone}
        customerName={customerName}
      />
    </>
  );
}

function buildTechPresentationBenefits(item: JobCartItem) {
  const meta = (item.metadata || {}) as Record<string, any>;
  const sales = Array.isArray(meta.sales_positioning) ? meta.sales_positioning : [];
  const fallback = [
    {
      title: "Comfort",
      body: "Lead with even temperatures, lower humidity, and fewer hot spots.",
    },
    {
      title: "Reliability",
      body: "Matched equipment, AHRI proof, and a clean startup process.",
    },
    {
      title: "Peace of mind",
      body: "Warranty registration support, install documentation, and follow-up care.",
    },
    {
      title: "Efficiency",
      body: meta.seer2 ? `${meta.seer2} SEER2 helps explain the energy story.` : "Modern equipment helps reduce wasted energy.",
    },
  ];

  return (sales.length > 0 ? sales : fallback)
    .slice(0, 4)
    .map((benefit: any, index: number) => ({
      title: benefit.title || fallback[index]?.title || "Comfort",
      body: benefit.body || benefit.text || fallback[index]?.body || "",
    }));
}
