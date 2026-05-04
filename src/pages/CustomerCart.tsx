import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, CreditCard, DollarSign, Banknote, PenLine, CheckCircle2, Loader2, Package, Wrench, Zap, Sparkles, Phone, ShieldCheck, FileText, Crown, BadgePercent, MessageCircle, XCircle, CalendarDays, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { FinancingWidget } from "@/components/cart/FinancingWidget";
import { PaymentOptionStack } from "@/components/pricing/PaymentOptionStack";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";
import type { JobCart, JobCartItem } from "@/hooks/useJobCart";
import { buildComfortClubCartSummary, type ComfortClubPublicInfo } from "@/lib/comfortClubCart";
import { buildCustomerDecisionStory } from "@/lib/customerDecisionStory";
import { cn } from "@/lib/utils";

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

const TRUST_POINTS = [
  { title: "All-Inclusive Pricing", body: "Permits, standard materials, labor, startup, and cleanup are included so the price is clear." },
  { title: "Registered Warranty", body: "We help register the equipment and keep the warranty details with your customer record." },
  { title: "Rebate Packet Help", body: "We gather the AHRI certificate, model information, photos, permit details, and invoice paperwork." },
];

const INSTALL_INCLUDED = [
  "Matched indoor and outdoor equipment",
  "New disconnect, whip, pad, and sealed connections as needed",
  "Drain safety, startup testing, and refrigerant verification",
  "Old equipment removal and jobsite cleanup",
  "Thermostat setup and homeowner walkthrough",
];

const DEFAULT_PUBLIC_COMPANY_NAME = "the office";

interface CartView {
  cart: JobCart;
  items: JobCartItem[];
  job: { customer_name?: string | null; address?: string | null; assigned_to?: string | null; job_number?: string | null } | null;
  company: { name: string; phone: string; tagline?: string; financingDisclaimer?: string; logoUrl?: string; businessUnitSlug?: string | null };
  pricing: Record<string, any>;
  memberInfo?: ComfortClubPublicInfo | null;
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
            name: settingsMap.company_name || DEFAULT_PUBLIC_COMPANY_NAME,
            phone: settingsMap.company_phone || "",
            tagline: settingsMap.company_tagline || "",
            financingDisclaimer: settingsMap.cart_financing_disclaimer || "",
            logoUrl: settingsMap.company_logo_url || "",
            businessUnitSlug: settingsMap.business_unit_slug || null,
          },
          pricing: (publicCart.pricing || publicCart.cart?.pricing_summary || {}) as Record<string, any>,
          memberInfo: (publicCart.memberInfo as ComfortClubPublicInfo | null) || null,
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

  const handlePay = async (method: "stripe" | "cash" | "financing" | "approve" | "contact" | "decline") => {
    if (!data) return;
    const hasActionableCart = data.items.length > 0 && Number(data.cart.total) > 0;
    if (!hasActionableCart) {
      toast.error("This estimate does not have any approved items yet. Please call the office before approving or paying.");
      return;
    }
    const confirmText: Partial<Record<typeof method, string>> = {
      cash: "Approve this estimate and pay cash on visit?",
      approve: "Approve this estimate scope?",
      contact: "Send a question/request callback for this estimate?",
      decline: "Decline this estimate?",
    };
    if (confirmText[method] && !window.confirm(confirmText[method])) return;
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

  const { cart, items, job, company, pricing } = data;
  const total = Number(cart.total);
  const equipmentItems = items.filter((item) => item.kind === "equipment");
  const primaryEquipment = equipmentItems[0] || null;
  const primaryMeta = (primaryEquipment?.metadata || {}) as Record<string, any>;
  const hasActionableCart = items.length > 0 && total > 0;
  const isHvacCart = isHvacCompany(company.businessUnitSlug) || items.some(isHvacCartItem);
  const isPaid = cart.status === "paid";
  const isApproved = cart.status === "approved";
  const isDeclined = cart.status === "declined";
  const isPayAfterCompletion = (cart as any).payment_timing === "pay_after_completion";
  const isFinancing = (cart as any).payment_timing === "financing" || cart.payment_method === "financing";
  const canEditCart = !isPaid && !isApproved && !isDeclined;
  const canPayCart = hasActionableCart && !isPaid && !isDeclined && (!isApproved || isPayAfterCompletion);

  // System-purchase pricing framing — shows the same A/B/C stack the tech showed in person
  const hasEquipment = equipmentItems.length > 0;
  const showPaymentStack = isHvacCart && total >= 1500;
  const monthly36 = Number((cart as any).financing_monthly_36 ?? pricing?.financing?.monthly_36 ?? calcMonthly36(total) ?? 0);
  const monthly120 = Number((cart as any).financing_monthly_120 ?? pricing?.financing?.monthly_120 ?? calcMonthly120(total) ?? 0);
  // Option 1: only show rebate price (Option C) when there is real system equipment in the cart
  const rebatePrice = hasEquipment ? Math.round(total * 0.92 * 100) / 100 : total;
  const repairSubtotal = Number((cart as any).repair_subtotal ?? pricing.repair_subtotal ?? 0);
  const eligibleDiscountSubtotal = Number((cart as any).discount_eligible_subtotal ?? pricing.discount_eligible_subtotal ?? 0);
  const cashDiscountAmount = Number((cart as any).cash_discount_amount ?? pricing.cash_discount_amount ?? 0);
  const cashDiscountPercent = Number((cart as any).cash_discount_percent ?? pricing.cash_discount_percent ?? 15);
  const comfortClubDiscountAmount = Number((cart as any).comfort_club_discount_amount ?? pricing.comfort_club?.discount_amount ?? 0);
  const comfortClubDiscountPercent = Number((cart as any).comfort_club_discount_percent ?? pricing.comfort_club?.discount_percent ?? 15);
  const finalCashTotal = Number((cart as any).final_cash_total ?? pricing.final_cash_total ?? 0);
  const comfortClub = buildComfortClubCartSummary(data.memberInfo, {
    cartSubtotal: eligibleDiscountSubtotal || Number(cart.subtotal || 0),
    actualDiscountAmount: comfortClubDiscountAmount,
    items,
  });
  const comfortClubPerks = comfortClub.perks.slice(0, 3);
  const isPresentMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("present") === "1";
  const decisionStory = buildCustomerDecisionStory(items, job);

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <header className="bg-primary text-primary-foreground border-b border-primary/20">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {company.logoUrl && (
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  className="h-11 w-11 shrink-0 rounded bg-white object-contain p-1"
                />
              )}
              <div className="min-w-0">
                <p className="font-bold text-lg leading-tight truncate">{company.name}</p>
                {company.tagline && (
                  <p className="text-[11px] text-primary-foreground/75 leading-tight truncate">{company.tagline}</p>
                )}
                {job?.job_number && <p className="text-xs text-primary-foreground/75 mt-0.5">Order #{job.job_number}</p>}
              </div>
            </div>
            {company.phone && (
              <a href={`tel:${company.phone}`} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground shrink-0">
                <Phone className="h-4 w-4" /> {formatPhone(company.phone) || company.phone}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className={cn("mx-auto px-4 py-6 space-y-4", isPresentMode ? "max-w-4xl" : "max-w-2xl")}>
        <Card className="overflow-hidden border-primary/15">
          <div className="grid grid-cols-4 divide-x divide-border text-center">
            {[
              { label: "Estimate", icon: FileText, active: true },
              { label: "Appointments", icon: CalendarDays },
              { label: "Invoices", icon: ReceiptText },
              { label: "Message", icon: MessageCircle },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors",
                    item.active ? "bg-accent/10 text-primary" : "bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() => {
                    if (item.label === "Estimate") document.getElementById("customer-estimate")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    if (item.label === "Appointments") toast.info("Appointment details are handled by the office and your technician.");
                    if (item.label === "Invoices") document.getElementById("customer-payment")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    if (item.label === "Message") {
                      handlePay("contact");
                    }
                  }}
                >
                  <Icon className={cn("h-4 w-4", item.active ? "text-accent" : "")} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Card>

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
        {isDeclined && (
          <Card className="p-4 bg-muted border-border flex items-center gap-3">
            <XCircle className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">Estimate declined.</p>
              <p className="text-xs text-muted-foreground">If this was a mistake, call the office and we'll reopen it.</p>
            </div>
          </Card>
        )}

        {/* Greeting */}
        {canEditCart && (
          <div id="customer-estimate" className="space-y-1 scroll-mt-4">
            <h1 className="text-2xl font-bold">
              {isPresentMode ? decisionStory.headline : job?.customer_name ? `Hi ${job.customer_name.split(" ")[0]},` : "Your Estimate"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isPresentMode
                ? decisionStory.subheadline
                : primaryEquipment
                ? `Here is your ${primaryMeta.brand || ""} ${primaryMeta.tonnage ? `${primaryMeta.tonnage}-ton` : ""} comfort proposal from ${job?.assigned_to || "your tech"}.`
                : `Here's Estimate ${cart.estimate_number || ""} from ${job?.assigned_to || "your tech"}. Review the options and choose how you'd like to proceed.`}
            </p>
          </div>
        )}

        {isPresentMode && (
          <Card className="overflow-hidden border-primary/20 bg-background shadow-sm">
            <div className="bg-primary px-4 py-4 text-primary-foreground">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Decision guide</p>
              <h2 className="mt-1 text-xl font-bold">Clear enough to make a confident decision.</h2>
              <p className="mt-1 text-sm text-primary-foreground/80">
                We keep the technical proof attached, but the decision starts with what matters to your family.
              </p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-3">
              {[decisionStory.whatWeFound, decisionStory.whyNow, decisionStory.riskIfWaiting].map((card) => (
                <div key={card.title} className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-semibold text-foreground">{card.title}</p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{card.body}</p>
                </div>
              ))}
            </div>
            <div className="border-t bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What this option is meant to protect</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {decisionStory.benefits.map((benefit) => (
                  <div key={`${benefit.title}-${benefit.body}`} className="rounded-lg border bg-background p-3">
                    <p className="text-sm font-semibold text-foreground">{benefit.title}</p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{benefit.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {primaryEquipment && (
          <Card className="overflow-hidden border-primary/20 bg-background">
            {primaryEquipment.image_url && (
              <div className="h-44 w-full overflow-hidden bg-muted">
                <img src={primaryEquipment.image_url} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Badge className="w-fit bg-primary/10 text-primary border-primary/25" variant="outline">
                  {isPresentMode ? "Recommended comfort system" : "Your Custom Quote"}
                </Badge>
                <div>
                  <h2 className="text-2xl font-bold leading-tight">{primaryEquipment.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {primaryEquipment.description || "Built around comfort, reliability, efficiency, and peace of mind."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {buildBenefitCards(primaryEquipment).map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <div key={benefit.title} className="rounded-lg border bg-muted/20 p-3">
                      <Icon className="h-4 w-4 text-primary" />
                      <p className="mt-2 text-sm font-semibold leading-tight">{benefit.title}</p>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">{benefit.body}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {buildSpecChips(primaryEquipment).map((spec) => (
                  <div key={spec.label} className="rounded-md bg-primary/5 px-3 py-2 ring-1 ring-primary/10">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{spec.label}</p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">{spec.value}</p>
                  </div>
                ))}
              </div>

              {isHvacCart && Number(primaryMeta.early_rebate || primaryMeta.burnout_rebate || 0) > 0 && (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <div className="flex items-start gap-3">
                    <BadgePercent className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Estimated CPS Energy rebate</p>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">
                        This matchup may qualify for up to {formatMoney(Math.max(Number(primaryMeta.early_rebate || 0), Number(primaryMeta.burnout_rebate || 0)))} depending on CPS approval and replacement type.
                      </p>
                      {primaryMeta.cps_rebate_tier && <p className="mt-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">{primaryMeta.cps_rebate_tier}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
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

        {isHvacCart && comfortClub.isActive ? (
          <Card className="p-4 bg-emerald-500/10 border-emerald-500/25">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Crown className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Comfort Club savings</p>
                  {comfortClub.displayedSavings > 0 && (
                    <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30">
                      -${comfortClub.displayedSavings.toFixed(2)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your {comfortClub.planName} membership includes {comfortClub.discountPercent}% member pricing on eligible work.
                </p>
                {comfortClub.displayedSavings > 0 && (
                  <p className="mt-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {comfortClub.savingsLabel}: ${comfortClub.displayedSavings.toFixed(2)}
                  </p>
                )}
                {comfortClubPerks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {comfortClubPerks.map((perk) => (
                      <span key={perk} className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                        {perk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : isHvacCart ? (
          <Card className="p-4 bg-amber-500/10 border-amber-500/25">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <BadgePercent className="h-5 w-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Ask about Comfort Club</p>
                  <Badge variant="outline" className="text-[10px]">
                    ${comfortClub.planAnnualPrice.toFixed(0)}/year
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {comfortClub.displayedSavings > 0
                    ? `Members could save about $${comfortClub.displayedSavings.toFixed(2)} on this estimate.`
                    : "Members get service perks and preferred repair pricing."}
                </p>
                {comfortClubPerks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {comfortClubPerks.map((perk) => (
                      <span key={perk} className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300 border border-amber-500/20">
                        {perk}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">Your technician can review membership separately from this estimate.</p>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Items */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between gap-2">
            <p className="font-semibold text-sm flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" /> Attached cart · {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
            {hasEquipment && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-success/15 text-success ring-1 ring-success/30">
                <ShieldCheck className="h-3 w-3" /> 10-Year Parts Warranty
              </span>
            )}
          </div>
          <div className="divide-y">
            {items.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-semibold text-foreground">No estimate items are ready yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">Please call the office before approving or paying this estimate.</p>
              </div>
            ) : items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const itemMeta = (item.metadata || {}) as Record<string, any>;
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
                    {item.kind === "equipment" && itemMeta.model_summary ? (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">Models: {itemMeta.model_summary}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Qty {Number(item.quantity)}</p>
                    )}
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
          {repairSubtotal > 0 && (
            <div className="flex justify-between text-muted-foreground"><span>Repair subtotal</span><span>${repairSubtotal.toFixed(2)}</span></div>
          )}
          {eligibleDiscountSubtotal > 0 && cashDiscountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Cash discount ({cashDiscountPercent.toFixed(0)}%)</span>
              <span>-${cashDiscountAmount.toFixed(2)}</span>
            </div>
          )}
          {comfortClubDiscountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>{isHvacCart ? "Comfort Club" : "Member"} ({comfortClubDiscountPercent.toFixed(0)}%)</span>
              <span>-${comfortClubDiscountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>${Number(cart.tax_amount).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>${Number(cart.total).toFixed(2)}</span></div>
          {finalCashTotal > 0 && (cashDiscountAmount > 0 || comfortClubDiscountAmount > 0) && (
            <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
              <span>Cash total</span><span>${finalCashTotal.toFixed(2)}</span>
            </div>
          )}
        </Card>

        {/* Payment framing — A/B/C stack on system purchases, simple widget on small carts */}
        {canPayCart && showPaymentStack ? (
          <PaymentOptionStack
            financed={total}
            monthly36={monthly36}
            monthly120={monthly120}
            rebatePrice={rebatePrice}
            financingDisclaimer={company.financingDisclaimer}
          />
        ) : canPayCart ? (
          <FinancingWidget
            total={total}
            onApply={() => handlePay("financing")}
            financingDisclaimer={company.financingDisclaimer}
          />
        ) : null}

        {/* Rebate paperwork assistance — only when there's real system equipment */}
        {canEditCart && hasEquipment && isHvacCart && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Your protection</p>
                  <p className="mt-1 text-sm text-muted-foreground">Manufacturer parts warranty registration support, standard labor coverage, and Comfort Club maintenance guidance are included in the proposal path.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {TRUST_POINTS.map((point) => (
                  <div key={point.title} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-semibold leading-tight">{point.title}</p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{point.body}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">What is included</p>
                  <p className="mt-1 text-sm text-muted-foreground">All-inclusive install pricing means the important details are handled before the system is turned over to you.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {INSTALL_INCLUDED.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-md bg-muted/20 px-3 py-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-sm leading-snug">{item}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-3 flex items-start gap-3 bg-primary/5 border-primary/20">
              <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-xs leading-snug">
                <p className="font-semibold text-foreground">We prepare the rebate packet.</p>
                <p className="text-muted-foreground mt-0.5">
                  We provide AHRI information, equipment details, installation invoice details, and the supporting documents needed for CPS Energy review. Rebates are subject to CPS approval.
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* CTAs */}
        {canPayCart && (
          <Card id="customer-payment" className="p-4 space-y-2 scroll-mt-4">
            <p className="text-sm font-semibold mb-2">
              {isPayAfterCompletion ? "Ready to pay for the completed work?" : "Choose how to proceed:"}
            </p>
            <p className="text-xs text-muted-foreground">
              If card checkout is not available, approve the scope and our office can collect payment another way.
            </p>
            <Button className="w-full h-12 text-base" onClick={() => handlePay("stripe")} disabled={!!paying}>
              {paying === "stripe" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-5 w-5 mr-2" />}
              Pay by Card Now - ${Number(cart.total).toFixed(2)}
            </Button>
            <Button variant="outline" className="w-full h-11" onClick={() => handlePay("financing")} disabled={!!paying}>
              {paying === "financing" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-5 w-5 mr-2" />}
              Apply for Financing
            </Button>
            <Button variant="outline" className="w-full h-11" onClick={() => handlePay("cash")} disabled={!!paying}>
              {paying === "cash" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-5 w-5 mr-2" />}
              Pay Cash on Visit{finalCashTotal > 0 && finalCashTotal !== total ? ` - $${finalCashTotal.toFixed(2)}` : ""}
            </Button>
            <Button variant="ghost" className="w-full h-10 text-sm" onClick={() => handlePay("approve")} disabled={!!paying}>
              {paying === "approve" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
              Approve Scope Only / Pay Later
            </Button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Button variant="ghost" className="h-10 text-sm" onClick={() => handlePay("contact")} disabled={!!paying}>
                {paying === "contact" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                I Have Questions
              </Button>
              <Button variant="ghost" className="h-10 text-sm text-muted-foreground" onClick={() => handlePay("decline")} disabled={!!paying}>
                {paying === "decline" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Decline Estimate
              </Button>
            </div>
          </Card>
        )}

        <p className="text-[11px] text-center text-muted-foreground pt-2">
          Questions? Call {company.name} at {formatPhone(company.phone) || company.phone || "the number above"}.
        </p>
      </main>
    </div>
  );
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function buildBenefitCards(item: JobCartItem) {
  const meta = (item.metadata || {}) as Record<string, any>;
  const salesPositioning = Array.isArray(meta.sales_positioning) ? meta.sales_positioning : [];
  const featureBenefits = normalizePublicFeatures(meta.features_benefits);
  const merged = [...salesPositioning, ...featureBenefits.map((feature) => ({ title: "Comfort feature", body: feature.text }))];
  const fallback = [
    { title: "Comfort", body: "Built to keep the home cooler, less humid, and more consistent." },
    { title: "Reliability", body: "Matched equipment with documented AHRI performance." },
    { title: "Peace of mind", body: "Warranty support, clean installation, and follow-up care." },
    { title: "Efficiency", body: meta.seer2 ? `${meta.seer2} SEER2 performance helps reduce wasted energy.` : "Modern equipment helps reduce wasted energy." },
  ];
  return (merged.length > 0 ? merged : fallback).slice(0, 4).map((benefit, index) => ({
    title: benefit.title || fallback[index]?.title || "Comfort",
    body: benefit.body || benefit.text || fallback[index]?.body || "",
    icon: [Sparkles, ShieldCheck, CheckCircle2, Zap][index] || Sparkles,
  }));
}

function normalizePublicFeatures(features: unknown): Array<{ text: string }> {
  if (!features) return [];
  if (Array.isArray(features)) {
    return features
      .map((feature) => {
        if (typeof feature === "string") return { text: feature };
        if (feature && typeof feature === "object" && "text" in feature) return { text: String((feature as any).text) };
        return null;
      })
      .filter((feature): feature is { text: string } => !!feature?.text);
  }
  if (typeof features === "string") {
    return features.split(/\n|;|\|/).map((text) => ({ text: text.trim() })).filter((feature) => feature.text);
  }
  return [];
}

function buildSpecChips(item: JobCartItem) {
  const meta = (item.metadata || {}) as Record<string, any>;
  const specs = [
    { label: "SEER2", value: meta.seer2 },
    { label: "EER2", value: meta.eer2 },
    { label: "HSPF2", value: meta.hspf2 },
    { label: "AFUE", value: meta.afue ? `${meta.afue}%` : null },
    { label: "AHRI", value: meta.ahri_number },
    { label: "Install", value: meta.location_label || meta.application },
  ].filter((spec) => spec.value !== null && spec.value !== undefined && spec.value !== "");

  return specs.length > 0 ? specs.slice(0, 6) : [
    { label: "System", value: meta.system_type_label || item.kind },
    { label: "Brand", value: meta.brand || "Matched" },
  ];
}

function isHvacCompany(slug?: string | null) {
  const value = String(slug || "").toLowerCase();
  return ["carnes", "carnes-and-sons", "carnes_sons", "hvac"].includes(value);
}

function isHvacCartItem(item: JobCartItem) {
  if (item.kind === "equipment") return true;
  const meta = (item.metadata || {}) as Record<string, any>;
  const haystack = [
    item.name,
    item.description,
    meta.brand,
    meta.system_type,
    meta.system_type_label,
    meta.application,
    meta.model_summary,
  ].join(" ").toLowerCase();

  return Boolean(
    meta.seer2 ||
    meta.eer2 ||
    meta.hspf2 ||
    meta.afue ||
    meta.ahri_number ||
    meta.cps_rebate_tier ||
    /\b(hvac|heat pump|air handler|furnace|condenser|coil|seer|ahri|refrigerant)\b/.test(haystack),
  );
}
