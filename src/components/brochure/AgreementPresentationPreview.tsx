import { Shield, Crown, CheckCircle2, Sparkles, Clock, Wrench, DollarSign, Calendar, Zap, Award, TrendingUp, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CoverSection, TrustStrip, BrochureFooter,
} from "@/components/SalesPresentationLayout";
import { useMaintenancePlanTemplates, type PlanTemplate } from "@/hooks/useMaintenancePlanTemplates";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePresentationSections } from "@/hooks/usePresentationSections";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";

/* ── Icon mapping for perks ── */
const PERK_ICONS = [
  { match: /tune-up|inspection|visit/i, icon: Wrench },
  { match: /coil|clean/i, icon: Sparkles },
  { match: /refrigerant/i, icon: Zap },
  { match: /diagnostic/i, icon: Phone },
  { match: /repair|discount|%/i, icon: DollarSign },
  { match: /after.?hours|weekend|upcharge/i, icon: Clock },
  { match: /loyalty|credit/i, icon: Award },
  { match: /priority|schedul/i, icon: Calendar },
  { match: /warranty|compliance/i, icon: Shield },
];

function getPerkIcon(perk: string) {
  for (const { match, icon } of PERK_ICONS) {
    if (match.test(perk)) return icon;
  }
  return CheckCircle2;
}

const DEFAULT_VALUE_ROWS = [
  { item: "2 Precision Tune-Ups", retail: "$180", member: "Included" },
  { item: "Condenser Coil Cleaning", retail: "$89", member: "Included" },
  { item: "1 lb Refrigerant", retail: "$95", member: "Included" },
  { item: "Diagnostic Call", retail: "$89", member: "$29.99" },
  { item: "Emergency Visit (after hours)", retail: "+$75 upcharge", member: "Waived" },
];

function AgreementContent({ plan, companyName, isPreview, valueRows, honestNotesTitle, honestNotesBody }: { plan: PlanTemplate | null; companyName: string; isPreview?: boolean; valueRows: { item: string; retail: string; member: string }[]; honestNotesTitle: string; honestNotesBody: string }) {
  if (!plan) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">No Active Plan Template</h2>
        <p className="text-muted-foreground">Create a maintenance plan template to see the presentation preview.</p>
      </div>
    );
  }

  const perks = (plan.perks || []) as string[];
  const halfPrice = (plan.price / 2).toFixed(2);

  return (
    <>
      {/* ── Hero Section ── */}
      <div className="relative bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 left-10 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
          <Badge className="bg-white/15 text-white border-white/20 text-xs mb-6 backdrop-blur-sm">
            <Crown className="w-3 h-3 mr-1" /> Exclusive Membership
          </Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            {plan.name}
          </h1>
          <p className="text-emerald-100 text-base md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            {companyName}
          </p>
          <div className="inline-flex items-baseline gap-1 bg-white/10 backdrop-blur-sm rounded-2xl px-8 py-5 border border-white/20">
            <span className="text-5xl md:text-6xl font-extrabold">${plan.price}</span>
            <span className="text-emerald-200 text-lg">/year</span>
          </div>
          <p className="text-emerald-200 text-sm mt-4 max-w-md mx-auto">
            No monthly charges. No invoices. No renewals to track.<br />
            Billed ${halfPrice} at each visit — <strong className="text-white">your rate is locked in for life.</strong>
          </p>
        </div>
      </div>

      {/* ── What You Get ── */}
      <section className="max-w-4xl mx-auto px-4 py-14">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">What You Get</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Every benefit included with your membership — no add-ons, no fine print.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {perks.map((perk, i) => {
            const Icon = getPerkIcon(perk);
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-4 p-5 rounded-xl border transition-all hover:shadow-md",
                  "bg-card hover:bg-accent/5"
                )}
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm text-foreground leading-relaxed pt-1.5">{perk}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Simple Billing ── */}
      <section className="bg-muted/50 border-y">
        <div className="max-w-4xl mx-auto px-4 py-14">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Simple Billing</h2>
          </div>
          <div className="max-w-2xl mx-auto grid md:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="font-bold text-lg text-foreground">Spring Visit</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">${halfPrice}</p>
              <p className="text-xs text-muted-foreground mt-1">Paid when we arrive</p>
            </div>
            <div className="bg-card rounded-xl border p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="font-bold text-lg text-foreground">Fall Visit</p>
              <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">${halfPrice}</p>
              <p className="text-xs text-muted-foreground mt-1">Paid when we arrive</p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-6 max-w-lg mx-auto">
            That's your entire annual membership — no separate invoices, no auto-renewals, no confusion.
            <strong className="text-foreground"> Your rate is locked in permanently.</strong>
          </p>
        </div>
      </section>

      {/* ── Value Comparison ── */}
      <section className="max-w-4xl mx-auto px-4 py-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">What a Membership Is Worth</h2>
          <p className="text-muted-foreground">See how quickly the plan pays for itself.</p>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/80">
                <th className="text-left px-5 py-3 font-semibold text-foreground">Service</th>
                <th className="text-center px-5 py-3 font-semibold text-muted-foreground">Retail</th>
                <th className="text-center px-5 py-3 font-semibold text-emerald-600 dark:text-emerald-400">Member</th>
              </tr>
            </thead>
            <tbody>
              {valueRows.map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="px-5 py-3 text-foreground">{row.item}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{row.retail}</td>
                  <td className="px-5 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                    {row.member === "Included" ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Included
                      </span>
                    ) : row.member === "Waived" ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Waived
                      </span>
                    ) : row.member}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td className="px-5 py-3 font-bold text-foreground">Total Value</td>
                <td className="px-5 py-3 text-center font-bold text-muted-foreground">$528+</td>
                <td className="px-5 py-3 text-center">
                  <span className="font-extrabold text-lg text-emerald-600 dark:text-emerald-400">${plan.price}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── Honest Notes ── */}
      <section className="bg-muted/30 border-y">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <h3 className="text-lg font-bold text-foreground mb-4">{honestNotesTitle}</h3>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: honestNotesBody }}
          />
        </div>
      </section>

      {/* ── CTA ── */}
      {!isPreview && (
        <section className="max-w-4xl mx-auto px-4 py-14 text-center">
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-10">
            <TrendingUp className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Ready to Join?</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Lock in your rate today and never worry about your system again.
            </p>
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-10 shadow-lg shadow-emerald-600/25"
              disabled
            >
              Enroll Now — ${plan.price}/year
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

export { AgreementContent };

export default function AgreementPresentationPreview() {
  const { data: plans = [] } = useMaintenancePlanTemplates(true);
  const { settings } = useCompanySettings();
  const { getSection } = usePresentationSections();

  const plan = plans[0] || null;
  const companyName = settings?.company_name || DEFAULT_COMPANY_NAME;

  // Dynamic value comparison rows from plan template, fallback to defaults
  const valueRows = plan?.value_comparison?.length
    ? plan.value_comparison
    : DEFAULT_VALUE_ROWS;

  // Honest notes from presentation_sections
  const honestSection = getSection("agreement_honest_notes");
  const honestNotesTitle = honestSection?.title || "A Few Honest Notes";
  const defaultHonestBody = `<p>We'll do everything we can to keep your drain lines clear with cleaning and treatment at every visit. That said, we don't warranty drain lines or guarantee against clogs. Drain systems can fail between visits for reasons outside our control, and we'd rather be upfront about that than promise something we can't control.</p><p>Filter replacement is included in every visit. Just have your filter ready when we arrive.</p>`;
  const honestNotesBody = honestSection?.body_html || defaultHonestBody;

  return (
    <div className="bg-background rounded-lg border overflow-hidden">
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Service Agreement Presentation Preview — {plan ? "Live Data" : "No Plans Yet"}
        </span>
      </div>

      <div className="bg-white dark:bg-background">
        <CoverSection customerName="John Smith" variant="install" />
        <TrustStrip />
        <AgreementContent
          plan={plan}
          companyName={companyName}
          isPreview
          valueRows={valueRows}
          honestNotesTitle={honestNotesTitle}
          honestNotesBody={honestNotesBody}
        />
        <BrochureFooter />
      </div>
    </div>
  );
}
