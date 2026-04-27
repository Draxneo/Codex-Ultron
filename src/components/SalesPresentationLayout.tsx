import { cn } from "@/lib/utils";
import {
  Snowflake, ShieldCheck, Volume2, Wrench, Gauge, Settings, Droplets,
  Zap, Award, Wind, Wifi, BarChart3, ThermometerSun, Leaf, Star, DollarSign,
  CheckCircle2, Heart, Thermometer, Home, Timer, Phone,
} from "lucide-react";
import logoImg from "@/assets/logo.png";
import heroComfort from "@/assets/brochure-hero-comfort.jpg";
import heroSleep from "@/assets/brochure-hero-sleep.jpg";
import { BRAND_LOGOS, BRAND_ACCENT, BRAND_GRADIENTS, useBrandEngineering } from "@/data/brandEngineering";
import { usePresentationSections } from "@/hooks/usePresentationSections";
import { useQuery } from "@tanstack/react-query";
import { getPublicCompanySettings } from "@/lib/companySettings";

// ── Shared types ──
export interface Feature { icon: string; title: string; desc: string; }

export interface BrochureBlock {
  id?: string; series: string; brand: string; label: string; tagline: string;
  sort_order?: number; compressor_type: string; sound_level: string;
  humidity_desc: string; expected_lifespan: string; features: Feature[];
  header_gradient: string; accent_color: string; accent_bg: string;
  tier_color: string; tier_bg: string;
}

export interface ComparisonRow { label: string; good: string; better: string; best: string; }
export interface ComparisonBlock {
  id: string; category: string; icon: string; sort_order: number; rows: ComparisonRow[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  Snowflake, ShieldCheck, Volume2, Wrench, Gauge, Settings, Droplets,
  Zap, Award, Wind, Wifi, BarChart3, ThermometerSun, Leaf, Timer,
  Home, Thermometer, Star, CheckCircle2, Heart, DollarSign, Phone,
};

export function resolveIcon(name: string): React.ElementType {
  return ICON_MAP[name] || Snowflake;
}

export function resolveText(text: string, specs: { seer2: string; eer2: string; hspf2?: string }): string {
  return text
    .replace(/\{seer2\}/g, specs.seer2 || "—")
    .replace(/\{eer2\}/g, specs.eer2 || "—")
    .replace(/\{hspf2\}/g, specs.hspf2 || "—")
    .replace(/\{eer2_suffix\}/g, specs.eer2 ? ` / ${specs.eer2} EER2` : "");
}

// ── Section components ──

interface CoverSectionProps {
  customerName: string;
  variant?: "install" | "repair";
}

export function CoverSection({ customerName, variant = "install" }: CoverSectionProps) {
  const isRepair = variant === "repair";
  const { getSection } = usePresentationSections();
  const coverKey = isRepair ? "cover_repair" : "cover_install";
  const coverSection = getSection(coverKey);
  const defaultTitle = isRepair ? "Your system, diagnosed." : "Your home's comfort, reimagined.";
  const defaultSubtitle = isRepair
    ? "Here's what we found, what it means, and your options to get it fixed right."
    : "Not just cooler air — better sleep, cleaner air, and lower bills. This is what the right system feels like.";
  const coverTitle = coverSection?.title || defaultTitle;
  const coverSubtitle = coverSection?.subtitle || defaultSubtitle;
  return (
    <div className="relative min-h-[60vh] overflow-hidden bg-primary">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroComfort})` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/80 to-primary/40" />
      <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 120" fill="none" preserveAspectRatio="none">
        <path d="M0,80 C360,120 1080,40 1440,80 L1440,120 L0,120 Z" fill="white" />
      </svg>
      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-10 pb-32 sm:pt-16 sm:pb-40">
        <img src={logoImg} alt="Company Logo" className="h-14 sm:h-16 drop-shadow-lg" />
        <div className="mt-12 sm:mt-20 max-w-xl">
          {isRepair ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                  <Wrench className="h-6 w-6 text-white" />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary-foreground/60">Service Inspection Report</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-primary-foreground leading-[1.1] tracking-tight">
                {coverTitle}
              </h1>
              <p className="mt-5 text-lg sm:text-xl text-primary-foreground/70 leading-relaxed max-w-md">
                {coverSubtitle}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-primary-foreground leading-[1.1] tracking-tight">
                {coverTitle}
              </h1>
              <p className="mt-5 text-lg sm:text-xl text-primary-foreground/70 leading-relaxed max-w-md">
                {coverSubtitle}
              </p>
            </>
          )}
        </div>
        {customerName && (
          <div className="mt-10 inline-block">
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary-foreground/40 mb-1">Prepared for</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-foreground">{customerName}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Diagnosis Report Section (for repair presentations) ──

interface DiagnosisPhoto {
  url: string;
  label?: string;
}

export function DiagnosisReportSection({
  description,
  photos,
}: {
  description?: string;
  photos: DiagnosisPhoto[];
}) {
  if (!description && photos.length === 0) return null;

  return (
    <div className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-4 py-1.5 mb-4">
            <Wrench className="h-4 w-4 text-destructive" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-destructive">Inspection Findings</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">What We Found</h2>
          {description && (
            <p className="mt-4 text-muted-foreground leading-relaxed max-w-xl mx-auto">{description}</p>
          )}
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {photos.map((photo, i) => (
              <div key={i} className="relative group rounded-2xl overflow-hidden border border-border shadow-sm">
                <img
                  src={photo.url}
                  alt={photo.label || `Finding ${i + 1}`}
                  className="w-full h-40 sm:h-52 object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {photo.label && (
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <span className="text-xs sm:text-sm font-medium text-white drop-shadow-md">{photo.label}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TrustStrip() {
  const { getSection } = usePresentationSections();
  const section = getSection("trust_strip");
  const items = section?.items || [
    { icon: "ShieldCheck", text: "Factory Authorized Dealer", image: "carrier_logo" },
    { icon: "ShieldCheck", text: "Licensed & Insured" },
    { icon: "Star", text: "4.9 Rating", stars: 5 },
  ];

  return (
    <div className="bg-white border-b border-border">
      <div className="mx-auto flex max-w-4xl items-center justify-center gap-5 sm:gap-10 px-4 py-4 flex-wrap">
        {items.map((item: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            {item.image === "carrier_logo" ? (
              <img src={BRAND_LOGOS.carrier} alt="Carrier" className="h-5" />
            ) : item.stars ? (
              <>
                <div className="flex gap-0.5">
                  {[...Array(item.stars)].map((_, j) => <Star key={j} className="h-3.5 w-3.5 text-accent fill-accent" />)}
                </div>
              </>
            ) : (
              (() => { const Icon = resolveIcon(item.icon); return <Icon className="h-5 w-5 text-primary" />; })()
            )}
            <span className="text-sm font-medium text-foreground">{item.text}</span>
            {i < items.length - 1 && <div className="h-5 w-px bg-border ml-3 sm:ml-5 hidden sm:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhyUsSection() {
  const { getSection } = usePresentationSections();
  const section = getSection("why_us");
  const items = section?.items || [
    { icon: "Heart", text: "Family-owned & operated" },
    { icon: "DollarSign", text: "All-inclusive pricing — no hidden fees" },
    { icon: "ShieldCheck", text: "10-year parts warranty included" },
    { icon: "Wrench", text: "2-year labor warranty included" },
    { icon: "Settings", text: "2 years Comfort Club maintenance included" },
    { icon: "CheckCircle2", text: "Professional installation with safety features" },
    { icon: "Star", text: "Clean, respectful service guaranteed" },
  ];
  const title = section?.title || "What Sets Us Apart";
  const subtitle = section?.subtitle || "Why Us";

  return (
    <div className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-bold mb-3">{subtitle}</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">{title}</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {items.map((item: any, i: number) => {
            const Icon = resolveIcon(item.icon);
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-white p-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">{item.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function InstallationIncludesSection() {
  const { getSection } = usePresentationSections();
  const outdoor = getSection("installation_includes_outdoor");
  const indoor = getSection("installation_includes_indoor");
  const startup = getSection("installation_includes_startup");

  const outdoorItems = outdoor?.items || ["New pre-formed composite pad","Proper equipment leveling","New high-voltage emergency disconnect","New electrical whip(s)","Properly sized refrigerant lines","Re-insulated refrigerant lines","Factory-recommended start-up","EPA-compliant disposal"];
  const indoorItems = indoor?.items || ["Safe removal of existing equipment","Multi-positional furnace & evaporator coil","Gas line connection & leak testing","New primary drain pan","Ceiling saver pan","Float safety switch","Secure mounting","Re-sealed plenums","Sealed duct connections","Proper condensate drain piping","New thermostat installation","Homeowner orientation"];
  const startupItems = startup?.items || ["Refrigerant charge verified","Gas pressure tested","Electrical connections inspected","Full system operational testing","Final system walkthrough","Complete jobsite cleanup"];

  return (
    <div className="bg-muted/30 border-y border-border py-12 sm:py-16">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold mb-3">Your Installation Includes</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">All-Inclusive Pricing</h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Our quotes include permits, taxes, materials, and labor — no surprises, no hidden fees.
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="bg-primary/5 border-b border-border px-5 py-3">
              <p className="text-sm font-bold text-foreground">🏠 {outdoor?.title || "Outdoor Unit Installation"}</p>
            </div>
            <div className="p-5 space-y-2.5">
              {outdoorItems.map((item: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="bg-primary/5 border-b border-border px-5 py-3">
              <p className="text-sm font-bold text-foreground">🏡 {indoor?.title || "Indoor Unit Installation"}</p>
            </div>
            <div className="p-5 space-y-2.5">
              {indoorItems.map((item: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-white overflow-hidden">
          <div className="bg-primary/5 border-b border-border px-5 py-3">
            <p className="text-sm font-bold text-foreground">🔧 {startup?.title || "System Start-Up & Quality Control"}</p>
          </div>
          <div className="p-5 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {startupItems.map((item: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ComfortIntroSection() {
  const { getSection } = usePresentationSections();
  const section = getSection("comfort_intro");
  const title = section?.title || "Comfort Is More Than Temperature";
  const subtitle = section?.subtitle || "Before We Talk Equipment";
  const bodyHtml = section?.body_html || "The right system doesn't just cool your home — it controls humidity so your house doesn't feel clammy, runs quietly so you can sleep, and filters the air your family breathes.";
  const items = section?.items || [
    { icon: "Droplets", title: "Humidity Control", desc: "Removes excess moisture so your home feels comfortable at higher thermostat settings — saving energy without sacrificing comfort." },
    { icon: "Volume2", title: "Whisper-Quiet Operation", desc: "Modern systems run so quietly you'll forget they're on. No more loud cycling that wakes you up at night." },
    { icon: "Wind", title: "Cleaner Indoor Air", desc: "Advanced filtration captures dust, allergens, and pollutants — giving your family healthier air to breathe every day." },
  ];

  return (
    <div className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-accent font-bold mb-3">{subtitle}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">{title}</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed max-w-xl mx-auto">{bodyHtml}</p>
      </div>
      <div className="mx-auto max-w-3xl px-6 mt-8 grid sm:grid-cols-3 gap-6">
        {items.map((item: any) => {
          const Icon = resolveIcon(item.icon);
          return (
            <div key={item.title} className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <Icon className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface SystemCardProps {
  brand: string; label: string; tagline: string;
  specs: { seer2: string; eer2: string; hspf2?: string };
  features: Feature[]; block: BrochureBlock | null;
  isPopular?: boolean; isEven?: boolean; isSelected?: boolean;
  children?: React.ReactNode;
}

export function SystemCard({ brand, label, tagline, specs, features, block, isPopular, isEven, isSelected, children }: SystemCardProps) {
  const accent = BRAND_ACCENT[brand] || BRAND_ACCENT.carrier;
  const gradient = BRAND_GRADIENTS[brand] || BRAND_GRADIENTS.carrier;
  const brandLogo = BRAND_LOGOS[brand] || BRAND_LOGOS.carrier;

  const resolvedFeatures = features.map(f => ({
    icon: resolveIcon(f.icon),
    title: resolveText(f.title, specs),
    desc: resolveText(f.desc, specs),
  }));

  return (
    <div className={cn(
      "relative rounded-3xl overflow-hidden bg-card shadow-lg border border-border print:break-inside-avoid",
      isPopular && "ring-2 ring-accent/30",
      isSelected && "ring-4 ring-accent shadow-2xl",
    )}>
      {isPopular && (
        <div className="bg-accent text-accent-foreground text-center py-2 text-xs font-bold uppercase tracking-[0.25em]">
          ★ Most Popular Choice ★
        </div>
      )}
      <div className="relative overflow-hidden">
        <div className={cn("relative min-h-[220px] sm:min-h-[260px] flex items-end bg-gradient-to-br", gradient)}>
          <div className={cn("absolute inset-0 bg-cover bg-center opacity-30", isEven ? "bg-right" : "bg-left")}
            style={{ backgroundImage: `url(${isEven ? heroSleep : heroComfort})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none">
            <path d="M0,30 C480,60 960,0 1440,30 L1440,60 L0,60 Z" fill="white" />
          </svg>
          <div className="relative z-10 px-6 sm:px-10 pb-14 pt-8 w-full">
            <div className="flex items-center gap-3 mb-4">
              <img src={brandLogo} alt={brand} className="h-6 sm:h-7 opacity-90" />
              <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm text-white/90">
                {specs.seer2 ? `${specs.seer2} SEER2` : ""} · Air Conditioner
              </span>
            </div>
            <h3 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{label}</h3>
            <p className="mt-2 text-base sm:text-lg text-white/60">{tagline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {specs.seer2 && (
                <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-sm", accent.pillBg)}>
                  <Snowflake className="h-3.5 w-3.5 text-white" />
                  <span className="text-xs font-bold text-white">{specs.seer2} SEER2</span>
                </div>
              )}
              {specs.eer2 && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1.5">
                  <Gauge className="h-3.5 w-3.5 text-white" />
                  <span className="text-xs font-bold text-white">{specs.eer2} EER2</span>
                </div>
              )}
              {specs.hspf2 && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1.5">
                  <ThermometerSun className="h-3.5 w-3.5 text-white" />
                  <span className="text-xs font-bold text-white">{specs.hspf2} HSPF2</span>
                </div>
              )}
              <div className="inline-flex items-center gap-1.5 rounded-full bg-green-500/25 backdrop-blur-sm px-3 py-1.5">
                <Leaf className="h-3.5 w-3.5 text-green-200" />
                <span className="text-xs font-bold text-green-100">{brand === "goodman" ? "R-32" : "R-454B"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-10 py-8">
        <div className="grid gap-8 sm:grid-cols-2">
          {resolvedFeatures.map((feat, i) => {
            const FeatureIcon = feat.icon;
            return (
              <div key={i} className="flex gap-4">
                <div className="flex-shrink-0 mt-1">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", accent.bg)}>
                    <FeatureIcon className={cn("h-5 w-5", accent.color)} />
                  </div>
                </div>
                <div>
                  <h4 className={cn("text-sm font-bold uppercase tracking-wider mb-1", accent.color)}>{feat.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">System Specifications</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {[
                  { label: "Cooling Efficiency", value: specs.seer2 ? `${specs.seer2} SEER2` : "—" },
                  { label: "Peak Efficiency", value: specs.eer2 ? `${specs.eer2} EER2` : "—" },
                  ...(specs.hspf2 ? [{ label: "Heating Efficiency", value: `${specs.hspf2} HSPF2` }] : []),
                  { label: "Compressor", value: block?.compressor_type || "Single-stage" },
                  { label: "Sound Level", value: block?.sound_level || "Standard" },
                  { label: "Humidity Control", value: block?.humidity_desc || "Basic" },
                  { label: "Refrigerant", value: brand === "goodman" ? "R-32 (Next-Gen)" : "R-454B (Puron Advance®)" },
                  { label: "Expected Lifespan", value: block?.expected_lifespan || "12–15 years" },
                ].map((row, i) => (
                  <tr key={row.label} className={cn(i % 2 === 0 ? "bg-muted/30" : "bg-white")}>
                    <td className="px-4 py-2.5 font-medium text-muted-foreground w-2/5">{row.label}</td>
                    <td className="px-4 py-2.5 font-semibold text-foreground">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {specs.seer2 && (() => {
            const baselineSeer = 11;
            const seer2Num = parseFloat(specs.seer2) || 15;
            const annualBaseline = 1200;
            const annualNew = Math.round(annualBaseline * (baselineSeer / seer2Num));
            const annualSavings = annualBaseline - annualNew;
            const fiveYearSavings = annualSavings * 5;
            return (
              <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <DollarSign className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Est. ~${annualSavings}/yr in energy savings</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      Compared to a typical {baselineSeer} SEER system · that's <span className="font-semibold text-foreground">~${fiveYearSavings} over 5 years</span> back in your pocket.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      {children}
    </div>
  );
}

export function BrandEngineeringSection({ brand }: { brand: string }) {
  const { getEngineering, getLogo } = useBrandEngineering();
  const eng = getEngineering(brand);
  const brandLogo = getLogo(brand);

  return (
    <div className="relative overflow-hidden border-y border-border">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <div className="relative mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <div className="flex-shrink-0">
            {brandLogo && <img src={brandLogo} alt={brand} className="h-16 sm:h-20" />}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent font-bold mb-2">{eng.eyebrow}</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{eng.title}</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">{eng.body1}</p>
            <p className="mt-3 text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: eng.body2 }} />
          </div>
        </div>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {eng.badges.map(item => (
            <div key={item.text} className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
              <item.icon className="h-5 w-5 flex-shrink-0 text-accent" />
              <span className="text-sm font-medium text-foreground">{item.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-accent/20 bg-accent/5 p-4 sm:p-5">
          <div className="flex gap-3 items-start">
            <Leaf className="h-5 w-5 flex-shrink-0 text-accent mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground mb-1">{eng.refrigerant.name}</p>
              <p className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: eng.refrigerant.detail }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandOptionsHeader({ brand }: { brand: string }) {
  const { getEngineering } = useBrandEngineering();
  const eng = getEngineering(brand);
  return (
    <div className="mx-auto max-w-3xl px-6 text-center mb-10">
      <p className="text-xs uppercase tracking-[0.3em] text-accent font-bold mb-3">Your Options</p>
      <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">{eng.headline}</h2>
      <p className="mt-3 text-muted-foreground leading-relaxed max-w-xl mx-auto">{eng.subhead}</p>
    </div>
  );
}

export function ComparisonSection({ compBlocks }: { compBlocks: ComparisonBlock[] }) {
  if (compBlocks.length === 0) return null;
  return (
    <div className="bg-muted/30 border-y border-border py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-bold mb-3">Side-by-Side</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">What Changes as You Move Up</h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Every system we install is reliable and warrantied. The difference between tiers? How quietly it runs, how well it handles humidity, and how precisely it keeps your home comfortable.
          </p>
        </div>
        <div className="space-y-6">
          {compBlocks.map(comp => (
            <div key={comp.id} className="rounded-2xl border bg-card overflow-hidden print:break-inside-avoid">
              <div className="px-5 py-4 bg-muted/50 border-b flex items-center gap-3">
                <span className="text-xl">{comp.icon}</span>
                <span className="text-base font-bold text-foreground">{comp.category}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground w-1/4"></th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-muted-foreground">Good</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-accent">Better</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-foreground">Best</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.rows.map((row, i) => (
                    <tr key={i} className={cn(i % 2 === 0 ? "bg-white" : "bg-muted/20")}>
                      <td className="px-5 py-2.5 font-medium text-muted-foreground text-xs">{row.label}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-foreground">{row.good}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-foreground">{row.better}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">{row.best}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="flex gap-3 items-start">
            <Heart className="h-5 w-5 flex-shrink-0 text-accent mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground mb-1">An honest note from Clint</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Every system we offer is one I'd put in my own home. The energy savings between tiers are real but modest — maybe $150–250 a year. Where you really feel the upgrade is in comfort: less noise, better humidity control, and more even temperatures room to room. If budget is tight, the Good tier is a great system. If comfort matters most, move up. Either way, you're getting quality equipment installed by our own trained crews — not subcontractors.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CpsRebateSection() {
  const { getSection } = usePresentationSections();
  const section = getSection("cps_rebate");

  const title = section?.title || "Your Utility Company Pays You Back";
  const subtitle = section?.subtitle || "CPS Energy offers rebates when you upgrade to a qualifying high-efficiency system. We guide you through every step.";
  const badge = section?.items?.[0]?.badge || "CPS Energy Rebate";

  const defaultSteps = [
    { step: "Step 1", desc: "We fill out and submit the rebate application for you within 30 days of installation." },
    { step: "Step 2", desc: "We provide all supporting documents — invoices, AHRI certificates, and permit info." },
    { step: "Step 3", desc: "CPS Energy processes your rebate and you receive a bill credit." },
  ];
  const steps = (section?.items?.length && section.items[0]?.steps)
    ? (section.items[0].steps as { step: string; desc: string }[])
    : defaultSteps;

  const defaultBullets = [
    "We complete & submit the application for you",
    "All required documents provided by us",
    "You just sit back and receive your bill credit",
  ];
  const bullets = (section?.items?.length && section.items[0]?.bullets)
    ? (section.items[0].bullets as string[])
    : defaultBullets;

  return (
    <div className="bg-white border-y border-border py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 mb-4">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{badge}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">{title}</h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">{subtitle}</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 mb-8">
          {steps.map(s => (
            <div key={s.step} className="text-left">
              <p className="text-sm font-bold text-primary mb-1">{s.step}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-6 sm:p-8">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white border border-border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Rebate</p>
              <p className="text-sm text-muted-foreground">Amount varies by system efficiency — we'll tell you exactly what you qualify for</p>
            </div>
            <div className="rounded-xl bg-white border border-border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">We Handle It All</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {bullets.map(t => (
                  <div key={t} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent flex-shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicServantSection() {
  const { getSection } = usePresentationSections();
  const section = getSection("public_servant");

  const title = section?.title || "We Take Care of Those Who Take Care of Us";
  const subtitle = section?.subtitle || "Military, first responders, teachers, nurses — you spend your days serving our community. This is our way of saying thank you.";
  
  const defaultGroups = ["Active & retired military", "Police, fire & EMS", "Teachers & educators", "Nurses & healthcare workers"];
  const groups = (section?.items?.length && section.items[0]?.groups)
    ? (section.items[0].groups as string[])
    : defaultGroups;

  const discountAmount = (section?.items?.length && section.items[0]?.discount) || "$250";
  const discountNote = (section?.items?.length && section.items[0]?.note) || "Stackable with factory rebates & financing offers";

  return (
    <div className="bg-white border-y border-border py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 mb-5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Public Servant Discount</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">{title}</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed max-w-xl mx-auto">{subtitle}</p>
        <div className="mt-6 grid sm:grid-cols-2 gap-4 max-w-md mx-auto text-left">
          {groups.map(group => (
            <div key={group} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-accent" />
              <span className="text-sm text-foreground">{group}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-6 py-4">
          <span className="text-2xl">🎖️</span>
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">{discountAmount} additional discount — on any system</p>
            <p className="text-xs text-muted-foreground">{discountNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LifestyleClose() {
  const { getSection } = usePresentationSections();
  const section = getSection("lifestyle_close");
  const title = section?.title || "Sleep cooler. Breathe easier. Wake up refreshed.";
  const body = section?.body_html || "The right system doesn't just change the temperature — it changes how you live.";

  return (
    <div className="relative overflow-hidden print:hidden">
      <div className="h-[300px] sm:h-[350px] bg-cover bg-center" style={{ backgroundImage: `url(${heroSleep})` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/50 to-transparent" />
      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto max-w-5xl px-6 sm:px-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground max-w-md leading-tight">
            {title}
          </h2>
          <p className="mt-3 text-primary-foreground/60 max-w-sm">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function BrochureFooter({ expiresAt, showPhone = false }: { expiresAt?: string; showPhone?: boolean }) {
  const { data: settings = {} } = useQuery({
    queryKey: ["public_company_settings"],
    queryFn: getPublicCompanySettings,
    staleTime: 30 * 60 * 1000,
  });
  const companyName = settings.company_name || "";
  const companyPhone = settings.company_phone || "";
  const companyEmail = settings.company_email || "";
  const companyTagline = settings.company_tagline || "Your trusted comfort experts";

  return (
    <div className="relative overflow-hidden bg-primary">
      <svg className="absolute top-0 left-0 w-full" viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none">
        <path d="M0,30 C480,0 960,60 1440,30 L1440,0 L0,0 Z" fill="white" />
      </svg>
      <div className="relative z-10 mx-auto max-w-3xl px-6 pt-16 pb-10 text-center">
        <img src={logoImg} alt={companyName} className="mx-auto h-14 opacity-90 mb-4" />
        <p className="text-base font-bold text-primary-foreground">{companyName}</p>
        <p className="mt-1 text-sm text-primary-foreground/50">{companyTagline}</p>
        {showPhone && (
          <div className="mt-5 flex items-center justify-center gap-2">
            <Phone className="h-5 w-5 text-accent" />
            <a href={`tel:${companyPhone.replace(/\D/g, "")}`} className="text-xl font-bold text-primary-foreground hover:underline">{companyPhone}</a>
          </div>
        )}
        <p className="mt-2 text-sm text-primary-foreground/40">{companyEmail}{!showPhone ? ` · ${companyPhone}` : ""}</p>
        {expiresAt && (
          <>
            <div className="mt-8 mx-auto h-px w-20 bg-primary-foreground/10" />
            <p className="mt-4 text-[11px] text-primary-foreground/25">
              Quote valid through {new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
