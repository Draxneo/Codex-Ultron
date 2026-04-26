import { AlertTriangle, Wrench, Star, Camera, DollarSign, CreditCard, BadgePercent, CheckCircle2 } from "lucide-react";
import { PaymentOptionDivider, SavingsBadge } from "@/components/brochure/PaymentOptionDivider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CoverSection, TrustStrip, BrochureFooter, DiagnosisReportSection,
} from "@/components/SalesPresentationLayout";
import { cn } from "@/lib/utils";
import { useRepairReportData } from "@/hooks/useRepairReportData";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const SAMPLE_DIAGNOSIS = {
  necessary: [
    {
      item: "Replace 45µF run capacitor — measured 28µF, bulging top",
      price: 285,
      customerDescription: "Repairing the component that ensures your outdoor unit starts reliably",
      importance: "This component manages the electrical charge needed for your system to cycle on.",
      consequences: "System won't start, potential electrical damage, no cooling.",
    },
    {
      item: "Contactor — pitted contacts, intermittent connection",
      price: 195,
      customerDescription: "Replacing the electrical switch that powers your cooling system on and off",
      importance: "This switch controls the flow of electricity to your outdoor unit every time it cycles.",
      consequences: "Intermittent cooling, system may stop working entirely, possible electrical arcing.",
    },
  ],
  recommended: [
    {
      item: "Drain pan treatment tabs — prevent clogs & algae buildup",
      price: 45,
      customerDescription: "Preventive treatment to keep your drainage system clear and flowing",
      importance: "Your system produces condensation that must drain properly to avoid water damage.",
      consequences: "Clogged drain lines, water overflow, potential ceiling or floor damage.",
    },
    {
      item: "Condensate drain flush — slow draining, risk of overflow",
      price: 125,
      customerDescription: "Clearing and restoring proper drainage from your cooling system",
      importance: "A slow drain puts your home at risk of water damage from overflow.",
      consequences: "Water backup, system shutdown via safety switch, mold growth risk.",
    },
  ],
  deluxe: [
    {
      item: "UV air purifier — iWave-R bi-polar ionization",
      price: 495,
      customerDescription: "Installing advanced air purification to eliminate airborne contaminants",
      importance: "Neutralizes mold, bacteria, and allergens circulating through your ductwork.",
      consequences: "No immediate risk — this is a comfort and health upgrade.",
    },
    {
      item: "Smart thermostat upgrade — Honeywell T6 Pro Wi-Fi",
      price: 350,
      customerDescription: "Upgrading your temperature control for smarter energy management",
      importance: "A modern thermostat optimizes run cycles and gives you remote control from your phone.",
      consequences: "No immediate risk — this is an efficiency and convenience upgrade.",
    },
  ],
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bgClass: string }> = {
  necessary: { label: "Necessary", color: "text-destructive", icon: AlertTriangle, bgClass: "bg-destructive/10 border-destructive/30" },
  recommended: { label: "Recommended", color: "text-amber-600", icon: Wrench, bgClass: "bg-amber-50 border-amber-200" },
  deluxe: { label: "Deluxe", color: "text-primary", icon: Star, bgClass: "bg-primary/5 border-primary/20" },
};

const SAMPLE_PHOTOS = [
  { url: "/placeholder.svg", label: "Failing capacitor — bulging top" },
  { url: "/placeholder.svg", label: "Pitted contactor contacts" },
  { url: "/placeholder.svg", label: "Slow condensate drain" },
];

interface RepairPresentationProps {
  jobId?: string;
}

export default function RepairPresentationPreview({ jobId }: RepairPresentationProps) {
  const { data: liveData, isLoading: liveLoading } = useRepairReportData(jobId);
  const useLive = !!jobId && !!liveData;

  if (jobId && liveLoading) {
    return <LoadingSpinner label="Loading repair data…" />;
  }

  const diagnosis = useLive ? liveData.diagnosis : SAMPLE_DIAGNOSIS;
  const photos = useLive ? liveData.photos : SAMPLE_PHOTOS;
  const customerName = useLive ? liveData.customerName : "John Smith";

  const combinedTotal = Object.values(diagnosis).flat().reduce((s, i) => s + i.price, 0);
  const monthlyPayment = Math.ceil(combinedTotal / 36);
  const payNowDiscount = combinedTotal * 0.10;
  const payNowPrice = combinedTotal - payNowDiscount;

  return (
    <div className="bg-background rounded-lg border overflow-hidden">
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Repair/Service Presentation Preview — {useLive ? "Live Data" : "Sample Data"}
        </span>
      </div>

      <div className="bg-white">
        <CoverSection customerName={customerName} variant="repair" />
        <TrustStrip />

        {/* Diagnosis Photos */}
        <section className="py-10 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 mb-3">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Photo Evidence</span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">What We Found</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden bg-muted aspect-square group">
                  <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-xs text-white font-medium">{photo.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tiered Diagnosis */}
        <section className="py-10 px-4 bg-muted/20">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">Your Repair Options</h2>
              <p className="text-sm text-muted-foreground mt-2">Choose the level of service that fits your needs and budget</p>
            </div>

            {(["necessary", "recommended", "deluxe"] as const).map((tier) => {
              const config = SEVERITY_CONFIG[tier];
              const items = diagnosis[tier];
              const total = items.reduce((s, i) => s + i.price, 0);
              const Icon = config.icon;

              return (
                <Card
                  key={tier}
                  className={cn("overflow-hidden border-2 transition-all hover:shadow-lg", config.bgClass)}
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", config.bgClass)}>
                          <Icon className={cn("h-5 w-5", config.color)} />
                        </div>
                        <div>
                          <Badge variant="outline" className={cn("text-xs font-bold", config.color)}>
                            {config.label}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tier === "necessary" ? "Must be addressed" : tier === "recommended" ? "Strongly suggested" : "Premium upgrades"}
                          </p>
                        </div>
                      </div>
                      <p className={cn("text-xl font-bold", config.color)}>${total.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      {items.map((item, i) => (
                        <div key={i} className="py-3 border-t border-border/50">
                          <div className="flex items-start justify-between text-sm">
                            <span className="text-foreground font-medium">{item.customerDescription || item.item}</span>
                            <span className="font-semibold text-foreground shrink-0 ml-4">${item.price}</span>
                          </div>
                          {item.importance && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-semibold">Importance:</span> {item.importance}
                            </p>
                          )}
                          {item.consequences && (
                            <p className="text-xs text-destructive/80 mt-0.5">
                              <span className="font-semibold">If not addressed:</span> {item.consequences}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Payment Options */}
        <section className="py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 mb-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Payment Options</span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Choose Your Payment Option</h2>
              <p className="text-sm text-muted-foreground mt-2">All approved tiers combined — ${combinedTotal.toLocaleString()} total service</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 relative">
              <PaymentOptionDivider />

              {/* Option A — Financing */}
              <div className="relative rounded-2xl border-2 border-primary/30 bg-card p-6 hover:shadow-xl transition-all">
                <div className="absolute -top-3 left-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground uppercase tracking-wider">
                    Option A
                  </span>
                </div>

                <div className="text-center pt-4 pb-2">
                  <p className="text-3xl sm:text-4xl font-bold text-primary">${monthlyPayment}<span className="text-lg font-normal text-muted-foreground">/mo</span></p>
                  <p className="text-sm font-bold text-foreground mt-2">No Interest · 36 Months</p>
                  <p className="text-xs text-muted-foreground mt-1">Easy monthly payments — 0% APR</p>
                </div>

                <div className="border-t border-border pt-4 mt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Service Price</span>
                    <span className="font-semibold text-foreground">${combinedTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Term</span>
                    <span className="font-semibold text-foreground">36 months @ 0% APR</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 mt-2">
                    <BadgePercent className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-primary font-medium">Service Plan members save an additional 10%</span>
                  </div>
                </div>
              </div>

              {/* Option B — Pay Now & Save */}
              <div className="relative rounded-2xl border-2 border-emerald-300 bg-card p-6 hover:shadow-xl transition-all">
                <div className="absolute -top-3 left-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
                    Option B
                  </span>
                </div>
                <SavingsBadge amount={`$${payNowDiscount.toLocaleString()}`} />

                <div className="text-center pt-4 pb-2">
                  <p className="text-3xl sm:text-4xl font-bold text-emerald-600">${payNowPrice.toLocaleString()}</p>
                  <p className="text-sm font-bold text-foreground mt-2">Pay Now — Save 10%</p>
                  <p className="text-xs text-muted-foreground mt-1">Cash · Check · Credit Card</p>
                </div>

                <div className="border-t border-border pt-4 mt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Service Price</span>
                    <span className="font-semibold text-foreground">${combinedTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pay-Now Discount (10%)
                    </span>
                    <span className="font-semibold">−${payNowDiscount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 mt-2">
                    <BadgePercent className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-700 font-medium">Service Plan discounts stack with pay-now savings</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Or approve individual tiers — pricing adjusts automatically. Service Plan discounts stack with all payment options.
            </p>
          </div>
        </section>

        <BrochureFooter />
      </div>
    </div>
  );
}
