import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, CreditCard, DollarSign, Banknote, PenLine, CheckCircle2, Loader2, Package, Wrench, Zap, Sparkles, Phone, ShieldCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { FinancingWidget } from "@/components/cart/FinancingWidget";
import { PaymentOptionStack } from "@/components/pricing/PaymentOptionStack";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";
import type { JobCart, JobCartItem } from "@/hooks/useJobCart";

const KIND_ICON: Record<JobCartItem["kind"], React.ComponentType<{ className?: string }>> = {
  equipment: Zap,
  repair: Wrench,
  part: Package,
  custom: Sparkles,
};

const KIND_COLOR: Record<JobCartItem["kind"], string> = {
  equipment: "bg-primary text-primary-foreground",
  repair: "bg-rose-500 text-white",
  part: "bg-amber-500 text-white",
  custom: "bg-violet-500 text-white",
};

interface CartView {
  cart: JobCart;
  items: JobCartItem[];
  job: { customer_name?: string | null; address?: string | null; assigned_to?: string | null; job_number?: string | null } | null;
  company: { name: string; phone: string; tagline?: string };
}

export default function CustomerCart() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) { setError("Missing token"); setLoading(false); return; }
      try {
        const { data: publicCart, error: cartErr } = await (supabase as any).rpc("get_public_job_cart", { p_token: token });
        if (cartErr) throw cartErr;
        if (!publicCart?.cart) { setError("Estimate not found"); setLoading(false); return; }
        const settingsMap = publicCart.company || {};

        setData({
          cart: publicCart.cart as JobCart,
          items: (publicCart.items || []) as JobCartItem[],
          job: (publicCart.job as any) || null,
          company: {
            name: settingsMap.company_name || "Carnes and Sons Air Conditioning",
            phone: settingsMap.company_phone || "",
            tagline: settingsMap.company_tagline || "",
          },
        });
      } catch (e: any) {
        setError(e.message || "Failed to load estimate");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  // Read-receipt: stamp first/last viewed, bump view_count once per page load
  useEffect(() => {
    if (!token) return;
    (supabase as any).rpc("track_cart_view", { p_token: token }).then(() => {}, () => { /* non-fatal */ });
  }, [token]);

  const handlePay = async (method: "stripe" | "cash" | "financing" | "approve") => {
    if (!data) return;
    setPaying(method);
    try {
      const { data: result, error } = await supabase.functions.invoke("cart-checkout", {
        body: {
          cart_token: token,
          payment_method: method,
          success_url: `${window.location.origin}/cart/${token}?paid=true`,
          cancel_url: window.location.href,
        },
      });
      if (error) throw error;
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast.success(result?.message || "Submitted!");
      // Reload
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setPaying(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-6 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">{error || "Estimate unavailable"}</p>
        </Card>
      </div>
    );
  }

  const { cart, items, job, company } = data;
  const isPaid = cart.status === "paid";
  const isApproved = cart.status === "approved";
  const isPayAfterCompletion = (cart as any).payment_timing === "pay_after_completion";
  const isFinancing = (cart as any).payment_timing === "financing" || cart.payment_method === "financing";
  const canEditCart = !isPaid && !isApproved;
  const canPayCart = !isPaid && (!isApproved || isPayAfterCompletion);

  // System-purchase pricing framing — shows the same A/B/C stack the tech showed in person
  const hasEquipment = items.some((i) => i.kind === "equipment");
  const total = Number(cart.total);
  const showPaymentStack = total >= 1500;
  const monthly36 = calcMonthly36(total) ?? 0;
  const monthly120 = calcMonthly120(total) ?? 0;
  // Option 1: only show rebate price (Option C) when there is real system equipment in the cart
  const rebatePrice = hasEquipment ? Math.round(total * 0.92 * 100) / 100 : total;

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <header className="bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-lg text-foreground leading-tight truncate">{company.name}</p>
              {company.tagline && (
                <p className="text-[11px] text-muted-foreground leading-tight truncate">{company.tagline}</p>
              )}
              {job?.job_number && <p className="text-xs text-muted-foreground mt-0.5">Order #{job.job_number}</p>}
            </div>
            {company.phone && (
              <a href={`tel:${company.phone}`} className="flex items-center gap-1.5 text-sm text-primary font-medium shrink-0">
                <Phone className="h-4 w-4" /> {company.phone}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Status banner */}
        {isPaid && (
          <Card className="p-4 bg-emerald-500/10 border-emerald-500/30 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Payment received — thank you!</p>
              <p className="text-xs text-muted-foreground">We'll be in touch shortly to confirm your service.</p>
            </div>
          </Card>
        )}
        {isApproved && !isPaid && (
          <Card className="p-4 bg-primary/10 border-primary/30 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold text-primary">
                {isPayAfterCompletion
                  ? "Approved - this estimate is saved for payment after the work is complete."
                  : isFinancing
                    ? "Approved - financing is selected and this estimate is saved while financing is completed."
                  : "Approved - your tech will collect on site."}
              </p>
              {isPayAfterCompletion && (
                <p className="text-xs text-muted-foreground mt-1">
                  When the repair is finished, use the payment options below or call the office if you need help.
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Greeting */}
        {canEditCart && (
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">
              {job?.customer_name ? `Hi ${job.customer_name.split(" ")[0]},` : "Your Estimate"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Here's Estimate {cart.estimate_number || ""} from {job?.assigned_to || "your tech"}. Review the options and choose how you'd like to proceed.
            </p>
          </div>
        )}

        {canEditCart && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm font-semibold">Choose the path that works best for you.</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div className="rounded-lg bg-background/80 border px-3 py-2">
                <p className="font-semibold text-foreground">Approve</p>
                <p>Reserve the repair or install scope.</p>
              </div>
              <div className="rounded-lg bg-background/80 border px-3 py-2">
                <p className="font-semibold text-foreground">Pay</p>
                <p>Check out now or after completion if offered.</p>
              </div>
              <div className="rounded-lg bg-background/80 border px-3 py-2">
                <p className="font-semibold text-foreground">Finance</p>
                <p>Apply for financing before work starts.</p>
              </div>
            </div>
          </Card>
        )}

        {/* Items */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between gap-2">
            <p className="font-semibold text-sm flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
            {hasEquipment && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-success/15 text-success ring-1 ring-success/30">
                <ShieldCheck className="h-3 w-3" /> 10-Year Parts Warranty
              </span>
            )}
          </div>
          <div className="divide-y">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <div key={item.id} className="p-3 flex gap-3 items-center">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-16 w-16 rounded object-cover bg-muted shrink-0" />
                  ) : (
                    <div className={`h-16 w-16 rounded flex items-center justify-center shrink-0 ${KIND_COLOR[item.kind]}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight">{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Qty {Number(item.quantity)}</p>
                  </div>
                  <p className="font-bold text-sm shrink-0">${Number(item.total_price).toFixed(2)}</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Totals */}
        <Card className="p-4 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${Number(cart.subtotal).toFixed(2)}</span></div>
          {Number((cart as any).discount_amount || 0) > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Discount {(cart as any).discount_code && `(${(cart as any).discount_code})`}</span>
              <span>−${Number((cart as any).discount_amount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>${Number(cart.tax_amount).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>${Number(cart.total).toFixed(2)}</span></div>
        </Card>

        {/* Payment framing — A/B/C stack on system purchases, simple widget on small carts */}
        {canPayCart && showPaymentStack ? (
          <PaymentOptionStack
            financed={total}
            monthly36={monthly36}
            monthly120={monthly120}
            rebatePrice={rebatePrice}
          />
        ) : canPayCart ? (
          <FinancingWidget
            total={total}
            onApply={() => handlePay("financing")}
          />
        ) : null}

        {/* Rebate paperwork assistance — only when there's real system equipment */}
        {canEditCart && hasEquipment && (
          <Card className="p-3 flex items-start gap-3 bg-primary/5 border-primary/20">
            <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-xs leading-snug">
              <p className="font-semibold text-foreground">We handle the rebate paperwork.</p>
              <p className="text-muted-foreground mt-0.5">
                Our team gathers and submits all CPS Energy and manufacturer rebate documents on your behalf — no forms for you to chase.
              </p>
            </div>
          </Card>
        )}

        {/* CTAs */}
        {canPayCart && (
          <Card className="p-4 space-y-2">
            <p className="text-sm font-semibold mb-2">
              {isPayAfterCompletion ? "Ready to pay for the completed work?" : "Choose how to proceed:"}
            </p>
            <Button className="w-full h-12 text-base" onClick={() => handlePay("stripe")} disabled={!!paying}>
              {paying === "stripe" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-5 w-5 mr-2" />}
              Pay Now — ${Number(cart.total).toFixed(2)}
            </Button>
            <Button variant="outline" className="w-full h-11" onClick={() => handlePay("financing")} disabled={!!paying}>
              {paying === "financing" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-5 w-5 mr-2" />}
              Apply for Financing
            </Button>
            <Button variant="outline" className="w-full h-11" onClick={() => handlePay("cash")} disabled={!!paying}>
              {paying === "cash" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-5 w-5 mr-2" />}
              Pay Cash on Visit
            </Button>
            <Button variant="ghost" className="w-full h-10 text-sm" onClick={() => handlePay("approve")} disabled={!!paying}>
              {paying === "approve" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
              Approve Scope Only (Sign)
            </Button>
          </Card>
        )}

        <p className="text-[11px] text-center text-muted-foreground pt-2">
          Questions? Call {company.name} at {company.phone || "the number above"}.
        </p>
      </main>
    </div>
  );
}
