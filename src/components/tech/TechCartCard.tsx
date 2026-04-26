/**
 * TechCartCard — Mobile-inline cart for the tech job detail page.
 *
 * State-driven action row replaces the old single "Send" button:
 *  - draft     → Send Cart for Approval · Present
 *  - sent      → "Sent · waiting" / "Viewed Xm ago" pill · Resend · Present
 *  - approved  → Approved badge · Charge / Invoice · Present receipt
 *  - declined  → Declined badge · Revise & Resend
 *  - paid      → Paid badge (no actions)
 *
 * Realtime subscription on `job_carts` (in useJobCart) auto-invalidates,
 * so buttons swap as the customer interacts with the public cart link.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useJobCart, type JobCartItem } from "@/hooks/useJobCart";
import { JobCartPicker } from "@/components/cart/JobCartPicker";
import { CartAddonSuggestions } from "@/components/cart/CartAddonSuggestions";
import { CartViewStatus } from "@/components/cart/CartViewStatus";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Props {
  jobId: string;
  customerPhone: string | null;
  customerName: string | null;
  bare?: boolean;
}

const KIND_ICON: Record<JobCartItem["kind"], typeof Package> = {
  equipment: Package,
  repair: Wrench,
  part: Zap,
  custom: Sparkles,
};

export function TechCartCard({ jobId, customerPhone, customerName, bare = false }: Props) {
  const navigate = useNavigate();
  const { cart, items, itemCount, addItem, removeItem, sendToCustomer, presentLink } = useJobCart(jobId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const total = Number(cart?.total ?? 0) || 0;
  const status = (cart as any)?.status || "draft";
  const firstViewedAt = (cart as any)?.first_viewed_at;
  const lastViewedAt = (cart as any)?.last_viewed_at;

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
    if (presentLink) window.open(presentLink, "_blank", "noopener");
  };

  const handleCharge = () => navigate(`/jobs/${jobId}?tab=invoice`);

  // ── Status-driven action row ──────────────────────────────────────
  const renderActionRow = () => {
    if (itemCount === 0) {
      return (
        <p className="text-[11px] text-muted-foreground italic">Add items, then send to customer for approval.</p>
      );
    }

    if (status === "paid") {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 h-8 px-3">
          <CheckCircle2 className="h-3.5 w-3.5" /> Paid · ${total.toFixed(2)}
        </Badge>
      );
    }

    if (status === "approved") {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 h-8 px-3">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved
          </Badge>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleCharge}>
            <CreditCard className="h-3.5 w-3.5" /> Charge / Invoice
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handlePresent} disabled={!presentLink}>
            <Presentation className="h-3.5 w-3.5" /> Present receipt
          </Button>
        </div>
      );
    }

    if (status === "declined") {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="destructive" className="gap-1.5 h-8 px-3">
            <X className="h-3.5 w-3.5" /> Declined
          </Badge>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSend} disabled={sendToCustomer.isPending}>
            <RefreshCw className="h-3.5 w-3.5" /> Revise & Resend
          </Button>
        </div>
      );
    }

    if (status === "sent") {
      const viewed = !!firstViewedAt;
      const pillText = viewed
        ? `Viewed ${formatDistanceToNow(new Date(lastViewedAt || firstViewedAt))} ago`
        : "Sent · waiting";
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1.5 h-8 px-3 text-xs">
            <Check className="h-3.5 w-3.5" /> {pillText}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={handleSend}
            disabled={sendToCustomer.isPending || !customerPhone}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Resend
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handlePresent} disabled={!presentLink}>
            <Presentation className="h-3.5 w-3.5" /> Present
          </Button>
        </div>
      );
    }

    // draft (with items)
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="h-9 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
          onClick={handleSend}
          disabled={sendToCustomer.isPending || !customerPhone}
        >
          <Send className="h-3.5 w-3.5" />
          {sendToCustomer.isPending ? "Sending…" : "Send Cart for Customer Approval"}
        </Button>
        <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={handlePresent} disabled={!presentLink}>
          <Presentation className="h-3.5 w-3.5" /> Present
        </Button>
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
            <p className="text-sm font-medium text-foreground leading-tight">Cart</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {itemCount} item{itemCount !== 1 ? "s" : ""} · ${total.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {bare && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex-1">
            {itemCount} item{itemCount !== 1 ? "s" : ""} · ${total.toFixed(2)}
          </p>
        </div>
      )}

      {/* Status-driven action row */}
      <div className="px-3 py-3 border-b border-border bg-muted/10">{renderActionRow()}</div>

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
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind] || Package;
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    qty {item.quantity} · ${Number(item.unit_price).toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  ${Number(item.total_price).toFixed(2)}
                </p>
                <button
                  type="button"
                  onClick={() => removeItem.mutate(item.id)}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted"
                  aria-label="Remove"
                  disabled={status === "approved" || status === "paid"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">No items yet. Add from pricebook or create custom.</p>
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
      {status !== "approved" && status !== "paid" && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 text-xs gap-1.5"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Pricebook
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 text-xs gap-1.5"
            onClick={() => setCustomOpen((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" /> Custom
          </Button>
        </div>
      )}

      {items.length > 0 && status !== "approved" && status !== "paid" && (
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
        customerPhone={customerPhone}
        customerName={customerName}
      />
    </>
  );
}
