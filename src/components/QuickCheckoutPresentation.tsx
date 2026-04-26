import { useState, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CreditCard, Star, Shield, Zap, AlertTriangle, Loader2, Clock, Landmark, Banknote } from "lucide-react";
import { getFeatureIcon } from "@/components/FeaturesEditor";
import { cn } from "@/lib/utils";
import { recordPresentationView } from "@/hooks/useEstimatePresentations";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";

interface Props {
  presentation: any;
  estimate?: any;
}

function DotIndicator({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex justify-center gap-2 py-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2.5 rounded-full transition-all",
            i === active ? "w-6 bg-primary" : "w-2.5 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export function QuickCheckoutPresentation({ presentation, estimate }: Props) {
  const [searchParams] = useSearchParams();
  const isPaid = searchParams.get("paid") === "true";
  const snapshot = presentation.pricing_snapshot;
  const isRepair = snapshot?.cart_type === "repair";
  const isSystem = snapshot?.cart_type === "new_system";
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(isPaid);
  const [submitting, setSubmitting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const viewRecorded = useRef(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "center" });

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setActiveSlide(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  // Record view on mount
  useEffect(() => {
    if (presentation?.id && !viewRecorded.current && !isPaid) {
      viewRecorded.current = true;
      recordPresentationView(presentation.token);
    }
  }, [presentation?.id, presentation?.token, isPaid]);

  const customerName = estimate?.customer_name?.split(" ")[0] || "";
  const addonTotal = Array.isArray(snapshot?.addons)
    ? snapshot.addons.reduce((sum: number, addon: any) => sum + Number(addon.price || 0), 0)
    : 0;

  // Already approved / paid
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">You're All Set{customerName ? `, ${customerName}` : ""}!</h2>
          <p className="text-muted-foreground">
            {isPaid
              ? "Payment received! Your technician will get started. You'll receive a confirmation text."
              : "Your approval is saved. If you chose to pay after the work, we will keep this cart ready for checkout when the repair is complete."}
          </p>
        </Card>
      </div>
    );
  }

  const handleApprove = async () => {
    if (!selectedOption || !paymentMethod) return;
    setSubmitting(true);
    try {
      if (paymentMethod === "stripe") {
        // Call estimate-checkout edge function to create Stripe session
        const { data, error } = await supabase.functions.invoke("estimate-checkout", {
          body: {
            presentation_id: presentation.id,
            selected_option_key: selectedOption,
            payment_method: "stripe",
            success_url: `${window.location.origin}/presentation/${presentation.token}?paid=true`,
            cancel_url: `${window.location.origin}/presentation/${presentation.token}`,
          },
        });

        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error(data?.error || "Failed to create checkout session");
      }

      // For cash/financing — call edge function which handles DB updates
      const { data, error } = await supabase.functions.invoke("estimate-checkout", {
        body: {
          presentation_id: presentation.id,
          selected_option_key: selectedOption,
          payment_method: paymentMethod,
        },
      });

      if (error) throw error;

      setSubmitted(true);
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // === REPAIR LAYOUT ===
  if (isRepair) {
    const tiers = snapshot.repair_tiers || {};
    const tierConfig = [
      { key: "critical", label: "Option A: Critical", Icon: AlertTriangle, desc: "Restore safe operation today", warning: "Declining critical repairs may result in complete system failure.", borderColor: "border-red-500/40", bgColor: "bg-red-500/5" },
      { key: "recommended", label: "Option B: Recommended", Icon: CheckCircle2, desc: "Fix the failure and reduce repeat issues", borderColor: "border-amber-500/40", bgColor: "bg-amber-500/5" },
      { key: "reconditioning", label: "Option C: Reconditioning", Icon: Shield, desc: "Best repair scope for reliability and comfort", borderColor: "border-emerald-500/40", bgColor: "bg-emerald-500/5" },
    ];

    const activeTiers = tierConfig.filter(t => tiers[t.key]?.length > 0);

    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-6 text-center">
          <h1 className="text-xl font-bold">Carnes & Sons Air Conditioning</h1>
          <p className="text-primary-foreground/80 text-sm mt-1">
            {customerName ? `Hi ${customerName} — here are your repair options` : "Your Repair Options"}
          </p>
        </div>

        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {activeTiers.map(tier => {
            const items = tiers[tier.key] as { item: string; description?: string; price: number; quantity?: number }[];
            const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
            const grandTotal = total + addonTotal;
            const monthly = Math.round(total * 0.0278);
            const isSelected = selectedOption === tier.key;
            const Icon = tier.Icon;

            return (
              <Card key={tier.key} className={cn("border-2 transition-all", tier.borderColor, tier.bgColor, isSelected && "ring-2 ring-primary shadow-lg")}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-bold text-lg">{tier.label}</h3>
                      <p className="text-xs text-muted-foreground">{tier.desc}</p>
                    </div>
                  </div>

                  <div className="divide-y">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between gap-3 py-2 text-sm">
                        <div>
                          <p className="font-medium">{item.item}</p>
                          {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                        </div>
                        <span className="font-medium shrink-0">${Number(item.price || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-3 flex justify-between items-end">
                    <div>
                      <p className="text-2xl font-bold">${grandTotal.toLocaleString()}</p>
                      {addonTotal > 0 && <p className="text-[11px] text-muted-foreground">Includes selected add-ons</p>}
                      <p className="text-xs text-muted-foreground">or ~${monthly}/mo with financing</p>
                    </div>
                    <Button
                      size="lg"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => setSelectedOption(tier.key)}
                      className="h-12 px-6"
                    >
                      {isSelected ? <><CheckCircle2 className="h-4 w-4 mr-1" /> Selected</> : "Choose This"}
                    </Button>
                  </div>

                  {tier.warning && tier.key === "critical" && (
                    <div className="flex items-start gap-2 text-xs text-red-600 bg-red-500/10 rounded-lg p-2 mt-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{tier.warning}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Addons */}
          {snapshot.addons?.length > 0 && <AddonsDisplay addons={snapshot.addons} />}

          {selectedOption && (
            <PaymentSection
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              onConfirm={handleApprove}
              submitting={submitting}
            />
          )}
        </div>
      </div>
    );
  }

  // === NEW SYSTEM LAYOUT (Swipeable) ===
  if (isSystem) {
    const options = snapshot.system_options || {};
    const optionKeys = Object.keys(options).filter(k => options[k]);
    const tierLabels: Record<string, string> = { good: "Good", better: "Better", best: "Best" };

    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-6 text-center">
          <h1 className="text-xl font-bold">Carnes & Sons Air Conditioning</h1>
          <p className="text-primary-foreground/80 text-sm mt-1">
            {customerName ? `Hi ${customerName} — here are your system options` : "Your System Options"}
          </p>
        </div>

        {optionKeys.length > 1 && activeSlide === 0 && (
          <p className="text-center text-sm text-muted-foreground py-2 animate-pulse">
            Swipe for more options →
          </p>
        )}

        <div ref={emblaRef} className="overflow-hidden px-2">
          <div className="flex">
            {optionKeys.map((key) => {
              const opt = options[key];
              const isSelected = selectedOption === key;
              return (
                <div key={key} className="flex-[0_0_90%] min-w-0 px-2 first:ml-[5%]">
                  <Card className={cn("border-2 transition-all my-4", isSelected && "ring-2 ring-primary shadow-lg", key === "better" && "border-primary/50")}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <Badge variant={key === "better" ? "default" : "secondary"} className="text-sm px-3 py-1">
                          {tierLabels[key] || key}
                        </Badge>
                        {key === "better" && (
                          <Badge variant="outline" className="text-xs border-primary text-primary">
                            <Star className="h-3 w-3 mr-1" /> Popular
                          </Badge>
                        )}
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">{opt.brand}</p>
                        <p className="font-bold text-lg">{opt.label}</p>
                      </div>

                      {opt.seer2 && (
                        <div className="bg-accent/30 rounded-xl p-4 text-center">
                          <p className="text-4xl font-black text-primary">{opt.seer2}</p>
                          <p className="text-xs text-muted-foreground font-medium">SEER2 Efficiency</p>
                        </div>
                      )}

                      {opt.features_benefits && opt.features_benefits.length > 0 ? (
                        <div className="space-y-2">
                          {opt.features_benefits.map((f: { icon: string; text: string }, i: number) => {
                            const IconComp = getFeatureIcon(f.icon);
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <IconComp className="h-4 w-4 text-primary shrink-0" />
                                <span>{f.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-primary" />
                            <span>{opt.tonnage ? `${opt.tonnage} Ton Capacity` : "High Performance"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Shield className="h-4 w-4 text-primary" />
                            <span>10-Year Warranty</span>
                          </div>
                          {opt.description && (
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                              <span>{opt.description}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="border-t pt-4 text-center">
                        {opt.monthly_payment && (
                          <p className="text-3xl font-black">${opt.monthly_payment}<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                        )}
                        <p className="text-sm text-muted-foreground">${(opt.price || 0).toLocaleString()} installed</p>
                      </div>

                      <Button
                        size="lg"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => setSelectedOption(key)}
                        className="w-full h-14 text-base"
                      >
                        {isSelected ? <><CheckCircle2 className="h-5 w-5 mr-2" /> Selected</> : "Select This System"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        {optionKeys.length > 1 && <DotIndicator count={optionKeys.length} active={activeSlide} />}

        {/* Addons */}
        {snapshot.addons?.length > 0 && (
          <div className="px-4">
            <AddonsDisplay addons={snapshot.addons} />
          </div>
        )}

        {selectedOption && (
          <div className="px-4 pb-8">
            <PaymentSection
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              onConfirm={handleApprove}
              submitting={submitting}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-muted-foreground">No estimate data found.</p>
    </div>
  );
}

function AddonsDisplay({ addons }: { addons: { name: string; description?: string; price: number; original_price?: number }[] }) {
  return (
    <Card className="border">
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Included Add-Ons
        </h3>
        <div className="space-y-2">
          {addons.map((addon, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <div>
                <p className="font-medium">{addon.name}</p>
                {addon.description && <p className="text-xs text-muted-foreground">{addon.description}</p>}
              </div>
              <div className="text-right">
                {addon.original_price && (
                  <p className="text-xs line-through text-muted-foreground">${addon.original_price}</p>
                )}
                <p className="font-semibold">${addon.price.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentSection({ paymentMethod, setPaymentMethod, onConfirm, submitting }: {
  paymentMethod: string | null;
  setPaymentMethod: (m: string) => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const methods = [
    { key: "stripe", label: "Pay Online Now", desc: "Secure card payment", icon: CreditCard },
    { key: "pay_after_completion", label: "Pay After Work", desc: "Approve today, pay after completion", icon: Clock },
    { key: "financing_36mo", label: "0% APR - 36 Mo", desc: "No money down - easy approval", icon: Landmark },
    { key: "financing_120mo", label: "9.99% APR - 120 Mo", desc: "Lowest monthly payment", icon: Landmark },
    { key: "factory_rebate", label: "Cash/Check/Card Later", desc: "One-time price after completion", icon: Banknote },
  ];

  return (
    <Card className="border-2">
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="font-bold text-lg">Choose how to proceed</h3>
          <p className="text-xs text-muted-foreground mt-1">Your selection creates a saved Carnes and Sons cart so the office and tech can track the approved scope.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {methods.map(m => (
            <button
              key={m.key}
              onClick={() => setPaymentMethod(m.key)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center",
                paymentMethod === m.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-muted hover:border-primary/50"
              )}
            >
              <m.icon className="h-5 w-5 text-primary" />
              <span className="font-semibold text-xs">{m.label}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{m.desc}</span>
            </button>
          ))}
        </div>

        {paymentMethod && (
          <Button
            onClick={onConfirm}
            disabled={submitting}
            size="lg"
            className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
          >
            {submitting ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
            ) : paymentMethod === "stripe" ? (
              "Proceed to Checkout"
            ) : (
              "Approve & Save Cart"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
