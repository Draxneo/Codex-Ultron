import { useState } from "react";
import {
  Shield, Thermometer, Snowflake, Zap, Wind, Droplets, CheckCircle2,
  AlertTriangle, XCircle, Camera, Wrench, Star, Crown, Heart, DollarSign,
  Gauge, Activity, Fan, Flame,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CoverSection, TrustStrip, BrochureFooter } from "@/components/SalesPresentationLayout";
import { cn } from "@/lib/utils";
import { useMaintenanceReportData } from "@/hooks/useMaintenanceReportData";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

/* ── Types ── */

type Season = "cooling" | "heating";
type GradeLevel = "A" | "B" | "C" | "D" | "F";

interface SystemGrade {
  system: string;
  icon: React.ElementType;
  grade: GradeLevel;
  summary: string;
  items: { label: string; status: "pass" | "marginal" | "fail"; note?: string }[];
}

interface ReadingItem {
  label: string;
  value: string;
  unit: string;
  status: "normal" | "marginal" | "critical";
  range?: string;
  season: "cooling" | "heating" | "shared";
}

/* ── Config ── */

const GRADE_CONFIG: Record<GradeLevel, { bg: string; text: string; ring: string }> = {
  A: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-300" },
  B: { bg: "bg-sky-100", text: "text-sky-700", ring: "ring-sky-300" },
  C: { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-300" },
  D: { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-300" },
  F: { bg: "bg-destructive/10", text: "text-destructive", ring: "ring-destructive/30" },
};

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: "text-emerald-600", label: "Pass" },
  marginal: { icon: AlertTriangle, color: "text-amber-500", label: "Marginal" },
  fail: { icon: XCircle, color: "text-destructive", label: "Fail" },
};

const READING_STATUS = {
  normal: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  marginal: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-600" },
  critical: { bg: "bg-destructive/5", border: "border-destructive/30", text: "text-destructive" },
};

const SEVERITY_CONFIG = {
  necessary: { label: "Needs Attention Now", color: "text-destructive", icon: AlertTriangle, bgClass: "bg-destructive/10 border-destructive/30" },
  recommended: { label: "Recommended", color: "text-amber-600", icon: Wrench, bgClass: "bg-amber-50 border-amber-200" },
  deluxe: { label: "Premium Upgrade", color: "text-primary", icon: Star, bgClass: "bg-primary/5 border-primary/20" },
};

/* ── Seasonal Sample Data ── */

function getSampleSystems(season: Season): SystemGrade[] {
  const shared: SystemGrade[] = [
    {
      system: "Airflow & Filtration",
      icon: Wind,
      grade: "C",
      summary: "Filter is very dirty — airflow is restricted.",
      items: [
        { label: "Blower motor operation", status: "pass" },
        { label: "Air filter condition", status: "fail", note: "Very dirty 20×25×1 — replaced" },
        { label: "Return airflow", status: "marginal", note: "Slightly restricted — verify after filter change" },
        { label: "Supply registers", status: "pass" },
      ],
    },
    {
      system: "Electrical",
      icon: Zap,
      grade: "A",
      summary: "All electrical readings within manufacturer specs.",
      items: [
        { label: "Voltage (242V — spec 240V ±10%)", status: "pass" },
        { label: "Amperage draw (12.1A — RLA 14.5A)", status: "pass" },
        { label: "Wiring & connections", status: "pass" },
        { label: "Disconnect / breaker", status: "pass" },
      ],
    },
  ];

  if (season === "cooling") {
    return [
      {
        system: "Cooling System",
        icon: Snowflake,
        grade: "B",
        summary: "System is operating within spec with one marginal reading.",
        items: [
          { label: "Compressor operation", status: "pass" },
          { label: "Refrigerant charge", status: "pass" },
          { label: "Capacitor (measured 40µF / spec 45µF)", status: "marginal", note: "Aging — monitor next visit" },
          { label: "Contactor", status: "pass" },
          { label: "Condensate drain", status: "pass" },
          { label: "Evaporator coil condition", status: "pass" },
        ],
      },
      ...shared,
    ];
  }

  return [
    {
      system: "Heating System",
      icon: Flame,
      grade: "A",
      summary: "All heating components in excellent condition.",
      items: [
        { label: "Heat exchanger visual inspection", status: "pass" },
        { label: "Carbon monoxide test (0 PPM)", status: "pass" },
        { label: "Gas pressure (3.5″ WC — spec 3.5″ WC)", status: "pass" },
        { label: "Ignition system", status: "pass" },
        { label: "Flue / venting", status: "pass" },
        { label: "Flame sensor (cleaned)", status: "pass" },
      ],
    },
    ...shared,
  ];
}

const ALL_READINGS: ReadingItem[] = [
  { label: "Suction Pressure", value: "68", unit: "psig", status: "normal", range: "60–75 psig", season: "cooling" },
  { label: "Discharge Pressure", value: "225", unit: "psig", status: "normal", range: "200–250 psig", season: "cooling" },
  { label: "Supply Temp", value: "55", unit: "°F", status: "normal", season: "cooling" },
  { label: "Return Temp", value: "74", unit: "°F", status: "normal", season: "shared" },
  { label: "Temperature Split (ΔT)", value: "19", unit: "°F", status: "normal", range: "16–22°F", season: "cooling" },
  { label: "Capacitor", value: "40", unit: "µF", status: "marginal", range: "Spec: 45µF (89%)", season: "cooling" },
  { label: "Supply Temp", value: "118", unit: "°F", status: "normal", range: "110–130°F", season: "heating" },
  { label: "Temperature Rise", value: "44", unit: "°F", status: "normal", range: "35–65°F", season: "heating" },
  { label: "Gas Pressure", value: "3.5", unit: "″ WC", status: "normal", range: "Spec: 3.5″ WC", season: "heating" },
  { label: "Carbon Monoxide", value: "0", unit: "PPM", status: "normal", range: "< 9 PPM safe", season: "heating" },
  { label: "Voltage", value: "242", unit: "V", status: "normal", range: "216–264V", season: "shared" },
  { label: "Amperage", value: "12.1", unit: "A", status: "normal", range: "RLA: 14.5A", season: "shared" },
];

function getSampleReadings(season: Season): ReadingItem[] {
  return ALL_READINGS.filter((r) => r.season === season || r.season === "shared");
}

function getSamplePhotos(season: Season) {
  const shared = [
    { url: "/placeholder.svg", label: "Filter — Very Dirty (Before)" },
    { url: "/placeholder.svg", label: "Filter — New (After)" },
    { url: "/placeholder.svg", label: "Data plate — Outdoor unit" },
  ];
  if (season === "cooling") {
    return [
      ...shared,
      { url: "/placeholder.svg", label: "Capacitor reading — 40µF" },
      { url: "/placeholder.svg", label: "Condensate drain — Clear" },
      { url: "/placeholder.svg", label: "Evaporator coil — Clean" },
    ];
  }
  return [
    ...shared,
    { url: "/placeholder.svg", label: "Heat exchanger — No cracks" },
    { url: "/placeholder.svg", label: "Flame sensor — Cleaned" },
    { url: "/placeholder.svg", label: "Flue pipe — Sealed" },
  ];
}

function getSampleRepairs(season: Season) {
  if (season === "cooling") {
    return {
      necessary: [] as { item: string; price: number }[],
      recommended: [
        { item: "Capacitor replacement — measured 40µF, spec 45µF (89%)", price: 285 },
        { item: "Drain pan treatment tabs — prevent clogs & algae buildup", price: 45 },
      ],
      deluxe: [
        { item: "UV air purifier — eliminate mold & bacteria in coil area", price: 495 },
      ],
    };
  }
  return {
    necessary: [] as { item: string; price: number }[],
    recommended: [
      { item: "Flame sensor replacement — cleaned but showing wear", price: 195 },
    ],
    deluxe: [
      { item: "Smart thermostat upgrade — optimize heating cycles & save energy", price: 350 },
      { item: "Whole-home humidifier — combat dry winter air", price: 695 },
    ],
  };
}

const SAMPLE_PERKS_USED = [
  { perk: "Tune-Up Visit (1 of 2)", used: true },
  { perk: "Coil Cleaning", used: true },
  { perk: "1 lb Refrigerant (if needed)", used: false },
  { perk: "$29.99 Diagnostic Rate", used: false },
  { perk: "15% Repair Discount", used: false },
  { perk: "5% Equipment Replacement Discount", used: false },
];

const SEASON_META: Record<Season, { label: string; icon: React.ElementType; gradient: string; badge: string }> = {
  cooling: {
    label: "Spring Cooling Tune-Up",
    icon: Snowflake,
    gradient: "from-emerald-900 via-emerald-800 to-teal-900",
    badge: "❄️",
  },
  heating: {
    label: "Fall Heating Tune-Up",
    icon: Flame,
    gradient: "from-orange-900 via-amber-800 to-red-900",
    badge: "🔥",
  },
};

/* ── Overall Grade ── */
function overallGrade(systems: SystemGrade[]): GradeLevel {
  const gradeValue: Record<GradeLevel, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const avg = systems.reduce((s, g) => s + gradeValue[g.grade], 0) / systems.length;
  if (avg >= 3.5) return "A";
  if (avg >= 2.5) return "B";
  if (avg >= 1.5) return "C";
  if (avg >= 0.5) return "D";
  return "F";
}

/* ── Component ── */
interface MaintenanceReportProps {
  jobId?: string;
}

export default function MaintenanceReportPreview({ jobId }: MaintenanceReportProps) {
  const [season, setSeason] = useState<Season>("cooling");
  const { data: liveData, isLoading: liveLoading } = useMaintenanceReportData(jobId);

  // If jobId provided and data loaded, use real data; otherwise sample data
  const useLive = !!jobId && !!liveData;

  if (jobId && liveLoading) {
    return <LoadingSpinner label="Loading report data…" />;
  }

  const activeSeason = useLive ? liveData.season : season;
  const systems = useLive
    ? liveData.systems.map(s => ({ ...s, icon: Wind }))
    : getSampleSystems(activeSeason);
  const readings = useLive ? liveData.readings : getSampleReadings(activeSeason);
  const photos = useLive ? liveData.photos : getSamplePhotos(activeSeason);
  const repairs = useLive ? liveData.repairs : getSampleRepairs(activeSeason);
  const customerName = useLive ? liveData.customerName : "John Smith";
  const meta = SEASON_META[activeSeason];
  const SeasonIcon = meta.icon;

  const overall = overallGrade(systems);
  const gc = GRADE_CONFIG[overall];
  const hasRepairs = Object.values(repairs).some((arr) => arr.length > 0);

  return (
    <div className="bg-background rounded-lg border overflow-hidden">
      {/* Admin bar */}
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Maintenance Report Preview — {useLive ? "Live Data" : "Sample Data"}
          </span>
        </div>
        {!useLive && (
          <ToggleGroup
            type="single"
            value={season}
            onValueChange={(v) => v && setSeason(v as Season)}
            className="bg-background rounded-lg border p-0.5"
          >
            <ToggleGroupItem value="cooling" className="text-xs gap-1.5 px-3 h-7 rounded-md data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-800">
              <Snowflake className="h-3.5 w-3.5" /> Cooling
            </ToggleGroupItem>
            <ToggleGroupItem value="heating" className="text-xs gap-1.5 px-3 h-7 rounded-md data-[state=on]:bg-amber-100 data-[state=on]:text-amber-800">
              <Flame className="h-3.5 w-3.5" /> Heating
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      <div className="bg-white">
        {/* ── Cover ── */}
        <section className={cn("relative overflow-hidden text-white py-16 px-4 bg-gradient-to-br", meta.gradient)}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-8 right-8 w-64 h-64 rounded-full border border-white/20" />
            <div className="absolute bottom-12 left-12 w-40 h-40 rounded-full border border-white/10" />
          </div>
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 mb-4">
              <SeasonIcon className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">{meta.badge} {meta.label}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Maintenance Inspection Report</h1>
            <p className="text-lg text-white/80">Prepared for <strong>{customerName}</strong></p>
            <p className="text-sm text-white/60 mt-1">{useLive ? liveData.address : "123 Main St, San Antonio, TX 78209"} • {useLive ? liveData.date : "March 25, 2026"}</p>
          </div>
        </section>

        <TrustStrip />

        {/* ── Overall Grade ── */}
        <section className="py-12 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className={cn(
              "inline-flex items-center justify-center w-28 h-28 rounded-full ring-4 mb-4",
              gc.bg, gc.ring,
            )}>
              <span className={cn("text-5xl font-black", gc.text)}>{overall}</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Overall System Health: {overall}</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {overall === "A" && "Your HVAC system is in excellent condition. Keep up the regular maintenance!"}
              {overall === "B" && "Your system is performing well with minor items to monitor."}
              {overall === "C" && "Some areas need attention to maintain optimal performance and efficiency."}
              {overall === "D" && "Several issues found — we recommend addressing them soon to prevent breakdowns."}
              {overall === "F" && "Critical issues detected. Immediate attention recommended."}
            </p>
          </div>
        </section>

        {/* ── System-by-System Scorecard ── */}
        <section className="py-10 px-4 bg-muted/20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 mb-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Inspection Scorecard
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">System-by-System Results</h2>
            </div>

            <div className="grid gap-4">
              {systems.map((sys) => {
                const sgc = GRADE_CONFIG[sys.grade];
                const SysIcon = sys.icon;
                return (
                  <Card key={sys.system} className="overflow-hidden border">
                    <div className="flex items-center gap-4 p-4 border-b bg-card">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center ring-2", sgc.bg, sgc.ring)}>
                        <span className={cn("text-xl font-black", sgc.text)}>{sys.grade}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <SysIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <h3 className="font-semibold text-foreground">{sys.system}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{sys.summary}</p>
                      </div>
                    </div>
                    <div className="divide-y divide-border/50">
                      {sys.items.map((item, i) => {
                        const sc = STATUS_CONFIG[item.status];
                        const StatusIcon = sc.icon;
                        return (
                          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                            <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", sc.color)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{item.label}</p>
                              {item.note && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] shrink-0", sc.color)}
                            >
                              {sc.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Readings & Diagnostics ── */}
        <section className="py-10 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 mb-3">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Technical Readings
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Diagnostic Measurements</h2>
              <p className="text-sm text-muted-foreground mt-1">All readings recorded during your maintenance visit</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {readings.map((r, i) => {
                const rs = READING_STATUS[r.status];
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-xl border-2 p-4 text-center transition-all",
                      rs.bg, rs.border,
                    )}
                  >
                    <p className="text-xs font-medium text-muted-foreground mb-1">{r.label}</p>
                    <p className={cn("text-3xl font-black", rs.text)}>
                      {r.value}<span className="text-base font-medium ml-0.5">{r.unit}</span>
                    </p>
                    {r.range && (
                      <p className="text-[10px] text-muted-foreground mt-1">{r.range}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Photo Evidence ── */}
        <section className="py-10 px-4 bg-muted/20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 mb-3">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Photo Documentation
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">What We Inspected</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((photo, i) => (
                <div
                  key={i}
                  className="relative rounded-xl overflow-hidden bg-muted aspect-square group"
                >
                  <img
                    src={photo.url}
                    alt={photo.label}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-xs text-white font-medium">{photo.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Recommended Repairs ── */}
        {hasRepairs && (
          <section className="py-10 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 mb-3">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Recommended Services
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Items Worth Addressing</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Based on today's inspection, here's what we'd recommend
                </p>
              </div>

              <div className="space-y-4">
                {(["necessary", "recommended", "deluxe"] as const)
                  .filter((tier) => repairs[tier].length > 0)
                  .map((tier) => {
                    const config = SEVERITY_CONFIG[tier];
                    const items = repairs[tier];
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
                              </div>
                            </div>
                            <p className={cn("text-xl font-bold", config.color)}>
                              ${total.toLocaleString()}
                            </p>
                          </div>
                          <div className="space-y-2">
                            {items.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between text-sm py-2 border-t border-border/50"
                              >
                                <span className="text-foreground">{item.item}</span>
                                <span className="font-semibold text-foreground shrink-0 ml-4">
                                  ${item.price}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {/* ── Comfort Club — Member Perks Used ── */}
        <section className="py-10 px-4 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 mb-3">
                <Crown className="h-4 w-4 text-emerald-700" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                  Comfort Club Member
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Your Membership Benefits</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Here's what was included with today's visit and what's still available
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {SAMPLE_PERKS_USED.map((p, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3.5",
                    p.used
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-white border-border",
                  )}
                >
                  {p.used ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  <span className={cn("text-sm", p.used ? "font-medium text-emerald-800" : "text-muted-foreground")}>
                    {p.perk}
                  </span>
                  {p.used && (
                    <Badge className="ml-auto bg-emerald-600 text-white text-[10px]">Used Today</Badge>
                  )}
                  {!p.used && (
                    <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">Available</Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-emerald-200 bg-white p-4 text-center">
              <p className="text-sm text-muted-foreground">Membership renews</p>
              <p className="text-lg font-bold text-foreground">September 15, 2026</p>
              <p className="text-xs text-emerald-600 mt-1">
                ✓ Your next tune-up visit is included — call to schedule anytime
              </p>
            </div>
          </div>
        </section>

        {/* ── Non-Member Savings Comparison ── */}
        <section className="py-10 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 mb-3">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  What You're Saving
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Comfort Club Savings Breakdown</h2>
            </div>

            <Card className="overflow-hidden border-2 border-primary/20">
              <div className="grid grid-cols-3 text-center divide-x divide-border">
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">Today's Service</p>
                  <p className="text-sm line-through text-muted-foreground">$199.00</p>
                  <p className="text-2xl font-black text-emerald-600">$99.50</p>
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Member Price</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">Annual Value</p>
                  <p className="text-2xl font-black text-primary">$847</p>
                  <p className="text-[10px] text-muted-foreground mt-1">In perks & discounts</p>
                </div>
                <div className="p-5 bg-primary/5">
                  <p className="text-xs text-muted-foreground mb-1">You've Saved</p>
                  <p className="text-2xl font-black text-primary">$149.50</p>
                  <p className="text-[10px] text-primary font-medium mt-1">This year so far</p>
                </div>
              </div>
            </Card>

            {/* Non-member pitch */}
            <div className="mt-8 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-emerald-50 border-2 border-primary/20 p-6 text-center">
              <Heart className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="text-lg font-bold text-foreground">Not a Comfort Club member yet?</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                You paid <strong>$199</strong> for today's service. As a member, this visit would have been just <strong>$99.50</strong> — plus you'd get 15% off all repairs, priority scheduling, and more.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-bold shadow-lg">
                <Crown className="h-4 w-4" />
                Join the Comfort Club — $199/year
              </div>
            </div>
          </div>
        </section>

        <BrochureFooter />
      </div>
    </div>
  );
}
