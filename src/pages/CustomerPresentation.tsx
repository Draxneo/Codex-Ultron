import { useParams } from "react-router-dom";
import { PaymentOptionDivider } from "@/components/brochure/PaymentOptionDivider";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QuickCheckoutPresentation } from "@/components/QuickCheckoutPresentation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, MessageSquare, XCircle, Loader2, Eye, CreditCard, Percent, Crown, Wrench, AlertTriangle, Star, Heart, DollarSign } from "lucide-react";
import {
  usePresentationByToken,
  recordPresentationView,
  submitEstimateResponse,
} from "@/hooks/useEstimatePresentations";
import {
  CoverSection, TrustStrip, WhyUsSection, InstallationIncludesSection,
  ComfortIntroSection, BrandEngineeringSection, BrandOptionsHeader, SystemCard,
  ComparisonSection, CpsRebateSection, PublicServantSection, LifestyleClose, BrochureFooter,
  DiagnosisReportSection,
  type BrochureBlock, type ComparisonBlock,
} from "@/components/SalesPresentationLayout";
import SalesPresentationPreview from "@/components/brochure/SalesPresentationPreview";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getCustomerAgreementDiscount } from "@/hooks/useServiceAgreements";

interface RepairTier {
  item: string;
  price: number;
}

interface RepairTiers {
  necessary: RepairTier[];
  recommended: RepairTier[];
  deluxe: RepairTier[];
}

function TierPrice({ items, isMember, memberDiscount }: { items: RepairTier[]; isMember: boolean; memberDiscount: number }) {
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const discountedTotal = isMember ? Math.round(subtotal * (1 - memberDiscount / 100)) : subtotal;
  return (
    <div className="text-right">
      {isMember && <span className="text-xs line-through text-muted-foreground mr-2">${subtotal.toLocaleString()}</span>}
      <span className="text-lg font-bold">${discountedTotal.toLocaleString()}</span>
    </div>
  );
}


export default function CustomerPresentation() {
  const { token } = useParams<{ token: string }>();
  const { data: presentation, isLoading: presLoading, isError: presError } = usePresentationByToken(token);
  const [estimate, setEstimate] = useState<any>(null);
  const [blocks, setBlocks] = useState<BrochureBlock[]>([]);
  const [compBlocks, setCompBlocks] = useState<ComparisonBlock[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState<"approve" | "questions" | "decline" | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [viewRecorded, setViewRecorded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<string>("");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [memberInfo, setMemberInfo] = useState<{ hasAgreement: boolean; discountPercent?: number; planName?: string }>({ hasAgreement: false });
  const [diagnosisPhotos, setDiagnosisPhotos] = useState<{ url: string; label?: string }[]>([]);

  // Load presentation data
  useEffect(() => {
    if (!presentation) return;

    // Record view
    if (!viewRecorded) {
      recordPresentationView(presentation.token);
      setViewRecorded(true);
    }

    // Load estimate + brochure data
    const load = async () => {
      const [estResult, bResult, cResult, aResult] = await Promise.all([
        supabase.from("estimates" as any).select("*").eq("id", presentation.estimate_id).single(),
        supabase.from("brochure_blocks").select("*").order("sort_order"),
        supabase.from("comparison_blocks").select("*").order("sort_order"),
        supabase.from("addons").select("*").eq("active", true).order("sort_order"),
      ]);
      if (estResult.data) {
        setEstimate(estResult.data);
        const est = estResult.data as any;
        // Check member status
        if (est.customer_id) {
          const discount = await getCustomerAgreementDiscount(est.customer_id);
          if (discount.hasAgreement) {
            setMemberInfo(discount);
          }
        }
        // Fetch diagnosis/before photos from the source service job
        if (est.source_job_id) {
          const { data: photos } = await supabase
            .from("tech_form_photos" as any)
            .select("photo_url, label")
            .eq("job_id", est.source_job_id)
            .order("created_at");
          if (photos && photos.length > 0) {
            setDiagnosisPhotos(photos.map((p: any) => ({ url: p.photo_url, label: p.label })));
          }
        }
      }
      if (bResult.data) setBlocks(bResult.data.map((d: any) => ({ ...d, features: d.features || [] })));
      if (cResult.data) setCompBlocks(cResult.data.map((d: any) => ({ ...d, rows: d.rows || [] })));
      if (aResult.data) setAddons(aResult.data);
      setLoading(false);
    };
    load();
  }, [presentation, viewRecorded]);

  const handleSubmit = async (action: "approved" | "changes_requested" | "declined") => {
    if (!presentation) return;
    setSubmitting(true);
    try {
      await submitEstimateResponse({
        estimate_id: presentation.estimate_id,
        presentation_id: presentation.id,
        action,
        message: message || undefined,
        payment_preference: action === "approved" ? selectedPayment || undefined : undefined,
        selected_tier: action === "approved" ? selectedTier || undefined : undefined,
        selected_addons: action === "approved" && selectedAddons.length > 0 ? selectedAddons : undefined,
      });
      setSubmitted(action);
      setShowDialog(null);
    } catch (e) {
      console.error("Failed to submit response:", e);
    }
    setSubmitting(false);
  };

  // Available tiers from the presentation
  const availableTiers = presentation?.selected_tiers || [];

  // Toggle addon
  const toggleAddon = (name: string) => {
    setSelectedAddons((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  };

  if (presError || (!presLoading && !presentation)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-2 max-w-sm">
          <Eye className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <h1 className="text-xl font-bold">Presentation Not Found</h1>
          <p className="text-muted-foreground text-sm">This link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (presLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-3/4 mx-auto" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (submitted) {
    const messages = {
      approved: { title: "You're All Set!", desc: "We've received your approval and will be in touch shortly to get this taken care of.", icon: CheckCircle2, color: "text-emerald-600" },
      changes_requested: { title: "Questions Received", desc: "We've received your message and will get back to you shortly.", icon: MessageSquare, color: "text-amber-600" },
      declined: { title: "Thank You", desc: "We appreciate you letting us know. If you change your mind, don't hesitate to reach out.", icon: XCircle, color: "text-muted-foreground" },
    };
    const m = messages[submitted as keyof typeof messages];
    const Icon = m.icon;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 px-4 max-w-md">
          <Icon className={`h-16 w-16 mx-auto ${m.color}`} />
          <h1 className="text-2xl font-bold">{m.title}</h1>
          <p className="text-muted-foreground">{m.desc}</p>
        </div>
      </div>
    );
  }

  // ──── TECH ON-SITE QUICK CHECKOUT ────
  if ((presentation as any).cart_source === "tech_onsite") {
    return <QuickCheckoutPresentation presentation={presentation} estimate={estimate} />;
  }

  const customerName = estimate?.customer_name || "Valued Customer";
  const isRepair = estimate?.estimate_type === "service_repair";
  const repairTiers: RepairTiers = estimate?.repair_tiers || { necessary: [], recommended: [], deluxe: [] };
  const cashDiscount = estimate?.cash_discount_percent || 0;

  // ──── REPAIR PRESENTATION ────
  if (isRepair) {
    const hasNecessary = repairTiers.necessary.length > 0;
    const hasRecommended = repairTiers.recommended.length > 0;
    const hasDeluxe = repairTiers.deluxe.length > 0;

    return (
      <div className="min-h-screen bg-background pb-24">
        {/* Branded cover — repair variant */}
        <CoverSection customerName={customerName} variant="repair" />
        <TrustStrip />

        {/* Member badge */}
        {memberInfo.hasAgreement && (
          <div className="mx-auto max-w-4xl px-6 mt-8">
            <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 sm:p-5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">{memberInfo.planName} Member</p>
                <p className="text-xs text-amber-600">{memberInfo.discountPercent}% discount applied to all repairs</p>
              </div>
            </div>
          </div>
        )}

        {/* Professional Diagnosis Report */}
        <DiagnosisReportSection
          description={estimate?.description}
          photos={diagnosisPhotos}
        />

        {/* Repair Tier Selection */}
        <div className="bg-muted/30 border-y border-border py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-10">
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-bold mb-3">Your Repair Options</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Choose What's Right for You</h2>
              <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
                We've organized the work into tiers — fix what's critical now, or take care of everything at once and save.
              </p>
            </div>

            <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
              {hasNecessary && (
                <div className={cn(
                  "rounded-2xl border-2 overflow-hidden bg-card shadow-sm transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
                  selectedTier === "necessary" ? "border-destructive ring-2 ring-destructive/30 shadow-xl" : "border-border hover:border-destructive/40"
                )} onClick={() => setSelectedTier("necessary")}>
                  <div className="bg-gradient-to-r from-destructive to-destructive/80 px-5 py-4 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-bold text-sm uppercase tracking-wider">Necessary</span>
                      </div>
                      {selectedTier === "necessary" && <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <p className="text-xs text-white/70 mt-1">Must-fix items to restore operation</p>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {repairTiers.necessary.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.item}</span>
                        <span className="font-semibold">${item.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 pb-5 pt-3 border-t border-border bg-muted/20">
                    {memberInfo.hasAgreement && (
                      <div className="flex items-center gap-1 mb-2">
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-600">Member Pricing: {memberInfo.discountPercent}% off</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-muted-foreground">Total</span>
                      <TierPrice items={repairTiers.necessary} isMember={memberInfo.hasAgreement} memberDiscount={memberInfo.discountPercent || 0} />
                    </div>
                  </div>
                </div>
              )}

              {hasRecommended && (
                <div className={cn(
                  "relative rounded-2xl border-2 overflow-hidden bg-card shadow-sm transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
                  selectedTier === "recommended" ? "border-accent ring-2 ring-accent/30 shadow-xl" : "border-border hover:border-accent/40"
                )} onClick={() => setSelectedTier("recommended")}>
                  <div className="bg-accent text-accent-foreground text-center py-1.5 text-[10px] font-bold uppercase tracking-[0.25em]">
                    ★ Most Popular ★
                  </div>
                  <div className="bg-gradient-to-r from-accent/90 to-accent/70 px-5 py-4 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="h-5 w-5" />
                        <span className="font-bold text-sm uppercase tracking-wider">Recommended</span>
                      </div>
                      {selectedTier === "recommended" && <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <p className="text-xs text-white/70 mt-1">Fix now + prevent future breakdowns</p>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {[...repairTiers.necessary, ...repairTiers.recommended].map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.item}</span>
                        <span className="font-semibold">${item.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 pb-5 pt-3 border-t border-border bg-muted/20">
                    {memberInfo.hasAgreement && (
                      <div className="flex items-center gap-1 mb-2">
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-600">Member Pricing: {memberInfo.discountPercent}% off</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-muted-foreground">Total</span>
                      <TierPrice items={[...repairTiers.necessary, ...repairTiers.recommended]} isMember={memberInfo.hasAgreement} memberDiscount={memberInfo.discountPercent || 0} />
                    </div>
                  </div>
                </div>
              )}

              {hasDeluxe && (
                <div className={cn(
                  "rounded-2xl border-2 overflow-hidden bg-card shadow-sm transition-all cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
                  selectedTier === "deluxe" ? "border-primary ring-2 ring-primary/30 shadow-xl" : "border-border hover:border-primary/40"
                )} onClick={() => setSelectedTier("deluxe")}>
                  <div className="bg-gradient-to-r from-primary to-primary/80 px-5 py-4 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crown className="h-5 w-5" />
                        <span className="font-bold text-sm uppercase tracking-wider">Deluxe</span>
                      </div>
                      {selectedTier === "deluxe" && <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <p className="text-xs text-white/70 mt-1">Complete overhaul — everything addressed</p>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {[...repairTiers.necessary, ...repairTiers.recommended, ...repairTiers.deluxe].map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.item}</span>
                        <span className="font-semibold">${item.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 pb-5 pt-3 border-t border-border bg-muted/20">
                    {memberInfo.hasAgreement && (
                      <div className="flex items-center gap-1 mb-2">
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-600">Member Pricing: {memberInfo.discountPercent}% off</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-muted-foreground">Total</span>
                      <TierPrice items={[...repairTiers.necessary, ...repairTiers.recommended, ...repairTiers.deluxe]} isMember={memberInfo.hasAgreement} memberDiscount={memberInfo.discountPercent || 0} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Honest note */}
            <div className="mt-8 rounded-xl border border-border bg-white p-5 sm:p-6">
              <div className="flex gap-3 items-start">
                <Heart className="h-5 w-5 flex-shrink-0 text-accent mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground mb-1">A note from your technician</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The "Necessary" tier gets your system running again. "Recommended" addresses the items that could cause another breakdown soon. "Deluxe" takes care of everything — think of it as a full tune-up and repair in one visit, at the best value per item. Pick what's right for your budget and comfort — there's no wrong choice.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Options — branded */}
        <div className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold mb-3">Payment Options</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">How Would You Like to Pay?</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {/* Option A — 0% / 36 mo */}
              <button
                type="button"
                onClick={() => setSelectedPayment("financing_36mo")}
                className={cn(
                  "rounded-2xl border-2 p-5 text-left transition-all relative",
                  selectedPayment === "financing_36mo" ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-lg" : "border-border hover:border-primary/40"
                )}
              >
                <div className="absolute -top-3 left-5">
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Option A
                  </span>
                </div>
                {selectedPayment === "financing_36mo" && <CheckCircle2 className="h-5 w-5 text-primary absolute top-3 right-3" />}
                <div className="pt-3">
                  <p className="text-lg font-bold text-foreground">0% APR · 36 Months</p>
                  <p className="text-sm text-muted-foreground mt-1">No money down · Easy approval</p>
                  <p className="text-xs text-primary font-semibold mt-3">Quick application</p>
                </div>
              </button>

              {/* Option B — 9.99% / 120 mo (Lowest Monthly) */}
              <button
                type="button"
                onClick={() => setSelectedPayment("financing_120mo")}
                className={cn(
                  "rounded-2xl border-2 p-5 text-left transition-all relative",
                  selectedPayment === "financing_120mo" ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-lg" : "border-border hover:border-primary/40"
                )}
              >
                <div className="absolute -top-3 left-5">
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Option B
                  </span>
                </div>
                {selectedPayment === "financing_120mo" && <CheckCircle2 className="h-5 w-5 text-primary absolute top-3 right-3" />}
                <div className="pt-3">
                  <p className="text-lg font-bold text-foreground">9.99% APR · 120 Months</p>
                  <p className="text-sm text-muted-foreground mt-1">Lowest monthly payment</p>
                  <p className="text-xs text-primary font-semibold mt-3">Plan 943 · Until paid in full</p>
                </div>
              </button>

              {/* Option C — Instant Factory Rebate */}
              <button
                type="button"
                onClick={() => setSelectedPayment("factory_rebate")}
                className={cn(
                  "rounded-2xl border-2 p-5 text-left transition-all relative",
                  selectedPayment === "factory_rebate" ? "border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-300/30 shadow-lg" : "border-border hover:border-emerald-300"
                )}
              >
                <div className="absolute -top-3 left-5">
                  <span className="bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Option C
                  </span>
                </div>
                <div className="absolute -top-3 right-3">
                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                    BEST VALUE
                  </span>
                </div>
                {selectedPayment === "factory_rebate" && <CheckCircle2 className="h-5 w-5 text-emerald-600 absolute top-9 right-3" />}
                <div className="pt-3">
                  <p className="text-lg font-bold text-foreground">Instant Factory Rebate</p>
                  <p className="text-sm text-muted-foreground mt-1">Cash, check, or credit card</p>
                  <p className="text-xs text-emerald-600 font-semibold mt-3">One-time price · Rebate applied instantly</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Agreement Upsell — branded */}
        {!memberInfo.hasAgreement && (
          <div className="border-y border-border py-12 sm:py-16 bg-gradient-to-br from-amber-50 via-white to-amber-50/30">
            <div className="mx-auto max-w-3xl px-6">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 mb-4">
                  <Crown className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Comfort Club</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Become a Member — Save on Every Visit</h2>
                <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
                  Join the Comfort Club and get priority service, lower repair costs, and peace of mind year-round.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 max-w-md mx-auto">
                {[
                  { text: "15% off all repairs", icon: Percent },
                  { text: "Priority scheduling", icon: Star },
                  { text: "Annual tune-ups included", icon: CheckCircle2 },
                  { text: "No overtime charges", icon: CreditCard },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white p-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <item.icon className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-amber-700 font-medium mt-6">Ask us about membership when we schedule your repair!</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <BrochureFooter showPhone />

        {/* Sticky bottom action bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg z-50">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2 p-3">
            <Button
              size="lg"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
              onClick={() => setShowDialog("approve")}
            >
              <CheckCircle2 className="h-5 w-5" />
              Approve Repair
            </Button>
            <Button variant="outline" size="lg" className="gap-2" onClick={() => setShowDialog("questions")}>
              <MessageSquare className="h-4 w-4" /> Questions
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={() => setShowDialog("decline")}>
              Not Now
            </Button>
          </div>
        </div>

        {/* Approve dialog (repair) */}
        <Dialog open={showDialog === "approve"} onOpenChange={(o) => !o && setShowDialog(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Approve Repair
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!selectedTier && (
                <p className="text-sm text-destructive">Please select a repair option above before confirming.</p>
              )}
              {selectedTier && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-sm"><strong>Selected:</strong> <span className="capitalize">{selectedTier}</span> repairs</p>
                  {selectedPayment && (
                    <p className="text-sm mt-1"><strong>Payment:</strong> {selectedPayment === "financing_36mo" ? "0% APR · 36 Mo" : selectedPayment === "financing_120mo" ? "9.99% APR · 120 Mo" : "Instant Factory Rebate"}</p>
                  )}
                </div>
              )}
              {!selectedPayment && (
                <p className="text-sm text-amber-600">Please select a payment option above.</p>
              )}
              <Textarea
                placeholder="Any notes? (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[60px]"
              />
              <p className="text-xs text-muted-foreground">
                By confirming, we'll get your repair scheduled. You're not locked in — we'll confirm all details.
              </p>
            </div>
            <DialogFooter>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleSubmit("approved")}
                disabled={submitting || !selectedPayment || !selectedTier}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {!selectedTier ? "Select a repair option" : !selectedPayment ? "Select payment" : "Confirm Repair"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Questions dialog */}
        <Dialog open={showDialog === "questions"} onOpenChange={(o) => !o && setShowDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-amber-600" /> Send Us Your Questions
              </DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="What questions do you have? We'll get back to you ASAP..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[120px]"
            />
            <DialogFooter>
              <Button className="w-full" onClick={() => handleSubmit("changes_requested")} disabled={submitting || !message.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Send Questions
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Decline dialog */}
        <Dialog open={showDialog === "decline"} onOpenChange={(o) => !o && setShowDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Not the Right Time?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">No problem at all. If you'd like to share any feedback, we'd love to hear it.</p>
            <Textarea placeholder="Any feedback? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[80px]" />
            <DialogFooter>
              <Button variant="outline" className="w-full" onClick={() => handleSubmit("declined")} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ──── SYSTEM REPLACEMENT PRESENTATION (existing) ────
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Member badge for installs too */}
      {memberInfo.hasAgreement && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <Crown className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{memberInfo.planName} Member</p>
              <p className="text-xs text-amber-600">{memberInfo.discountPercent}% member discount applied</p>
            </div>
          </div>
        </div>
      )}

      {/* Full sales presentation — pass price blocks from snapshot */}
      <SalesPresentationPreview
        blocks={blocks}
        compBlocks={compBlocks}
        addons={addons}
        priceBlocks={presentation?.pricing_snapshot?.priceBlocks}
        extraDiscount={presentation?.pricing_snapshot?.extra_discount || 0}
      />

      {/* Price Match Guarantee */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-6 h-6 text-accent" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Price Match Guarantee</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            We'll match any licensed contractor's written quote for the same equipment and scope of work, guaranteed.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            {["Same make & model", "Same scope of work", "Licensed TX contractor", "Written quote required"].map((item) => (
              <span key={item} className="flex items-center gap-1 bg-card rounded-full px-3 py-1 border">
                <CheckCircle2 className="w-3 h-3 text-success" /> {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg z-50">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2 p-3">
          <Button
            size="lg"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
            onClick={() => setShowDialog("approve")}
          >
            <CheckCircle2 className="h-5 w-5" />
            I'm Ready — Let's Go
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() => setShowDialog("questions")}
          >
            <MessageSquare className="h-4 w-4" />
            Questions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => setShowDialog("decline")}
          >
            Not Now
          </Button>
        </div>
      </div>

      {/* Approve dialog */}
      <Dialog open={showDialog === "approve"} onOpenChange={(o) => !o && setShowDialog(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Ready to Move Forward
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Tier Selection */}
            {availableTiers.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Which system do you prefer?</Label>
                <RadioGroup value={selectedTier} onValueChange={setSelectedTier} className="space-y-2">
                  {availableTiers.map((tier) => (
                    <label
                      key={tier}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        selectedTier === tier ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      )}
                    >
                      <RadioGroupItem value={tier} />
                      <span className="font-medium capitalize">{tier}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Payment Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">How would you like to pay?</Label>
              <div className="grid gap-2 relative">
                <button
                  type="button"
                  onClick={() => setSelectedPayment("financing_36mo")}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors relative",
                    selectedPayment === "financing_36mo" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div className="absolute -top-2 left-3">
                    <span className="bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">A</span>
                  </div>
                  <div className="rounded-full p-1.5 bg-primary/10 mt-0.5">
                    <Percent className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">0% APR · 36 Months</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No money down · Easy approval</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPayment("financing_120mo")}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors relative",
                    selectedPayment === "financing_120mo" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div className="absolute -top-2 left-3">
                    <span className="bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">B · Lowest Mo</span>
                  </div>
                  <div className="rounded-full p-1.5 bg-primary/10 mt-0.5">
                    <Percent className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">9.99% APR · 120 Months</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Lowest monthly payment · Plan 943</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPayment("factory_rebate")}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors relative",
                    selectedPayment === "factory_rebate" ? "border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-400" : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div className="absolute -top-2 left-3">
                    <span className="bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">C · Best Value</span>
                  </div>
                  <div className="rounded-full p-1.5 bg-emerald-500/10 mt-0.5">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Instant Factory Rebate</p>
                    <p className="text-xs text-muted-foreground mt-0.5">One-time price · Cash, check, or credit card</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Add-on Confirmation */}
            {addons.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Add-ons (optional)</Label>
                <div className="grid gap-1.5">
                  {addons.map((addon) => (
                    <label
                      key={addon.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors text-sm",
                        selectedAddons.includes(addon.name)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAddons.includes(addon.name)}
                        onChange={() => toggleAddon(addon.name)}
                        className="rounded border-muted-foreground/50"
                      />
                      <span className="flex-1 font-medium">{addon.name}</span>
                      {addon.cost > 0 && (
                        <span className="text-xs text-muted-foreground">${addon.cost}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <Textarea
              placeholder="Any notes or preferences? (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[60px]"
            />

            <p className="text-xs text-muted-foreground">
              By clicking confirm, we'll reach out to schedule your installation. You're not locked into anything yet — we'll finalize all details together.
            </p>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleSubmit("approved")}
              disabled={submitting || !selectedPayment}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {!selectedPayment ? "Select a payment option" : "Confirm — I'm Ready"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Questions dialog */}
      <Dialog open={showDialog === "questions"} onOpenChange={(o) => !o && setShowDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-amber-600" /> Send Us Your Questions
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="What questions do you have? We'll get back to you ASAP..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[120px]"
          />
          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => handleSubmit("changes_requested")}
              disabled={submitting || !message.trim()}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Send Questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline dialog */}
      <Dialog open={showDialog === "decline"} onOpenChange={(o) => !o && setShowDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Not the Right Time?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No problem at all. If you'd like to share any feedback, we'd love to hear it.
          </p>
          <Textarea
            placeholder="Any feedback? (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSubmit("declined")}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
