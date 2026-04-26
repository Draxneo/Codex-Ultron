import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Shield, Crown, TrendingUp, Calendar, Sparkles, Clock, Wrench, DollarSign, Zap, Award, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CoverSection, TrustStrip, BrochureFooter,
} from "@/components/SalesPresentationLayout";
import {
  useAgreementPresentationByToken,
  recordAgreementView,
  markAgreementEnrolled,
} from "@/hooks/useAgreementPresentations";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
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

const VALUE_ROWS = [
  { item: "2 Precision Tune-Ups", retail: "$180", member: "Included" },
  { item: "Condenser Coil Cleaning", retail: "$89", member: "Included" },
  { item: "1 lb Refrigerant", retail: "$95", member: "Included" },
  { item: "Diagnostic Call", retail: "$89", member: "$29.99" },
  { item: "Emergency Visit (after hours)", retail: "+$75 upcharge", member: "Waived" },
];

export default function AgreementPresentation() {
  const { token } = useParams<{ token: string }>();
  const { data: presentation, isLoading } = useAgreementPresentationByToken(token);
  const { settings } = useCompanySettings();
  const [viewRecorded, setViewRecorded] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [customerName, setCustomerName] = useState("");

  const companyName = settings?.company_name || DEFAULT_COMPANY_NAME;

  useEffect(() => {
    if (!presentation) return;
    if (!viewRecorded) {
      recordAgreementView(presentation.id, presentation.view_count, !presentation.first_viewed_at);
      setViewRecorded(true);
    }
    if (presentation.enrolled_at) setEnrolled(true);

    supabase
      .from("customers")
      .select("first_name, last_name")
      .eq("id", presentation.customer_id)
      .single()
      .then(({ data }) => {
        if (data) setCustomerName(`${data.first_name || ""} ${data.last_name || ""}`.trim());
      });
  }, [presentation]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Skeleton className="w-96 h-48" /></div>;
  }
  if (!presentation) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Presentation not found or expired.</div>;
  }

  const plans = (presentation.plan_options || []) as any[];
  const plan = plans[0]; // Primary plan

  if (!plan) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">No plan data available.</div>;
  }

  const perks = (plan.perks || []) as string[];
  const halfPrice = (plan.price / 2).toFixed(2);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await markAgreementEnrolled(presentation.id);
      setEnrolled(true);
      toast({ title: "Welcome to the family!", description: "We'll be in touch to schedule your first visit." });
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
    setEnrolling(false);
  };

  if (enrolled) {
    return (
      <div className="min-h-screen bg-background">
        <CoverSection customerName={customerName} variant="install" />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-foreground mb-3">Welcome to the {plan.name}!</h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Your enrollment has been submitted. We'll reach out shortly to finalize your membership and schedule your first visit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CoverSection customerName={customerName} variant="install" />
      <TrustStrip />

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
                className="flex items-start gap-4 p-5 rounded-xl border bg-card hover:bg-accent/5 transition-all hover:shadow-md"
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
              {VALUE_ROWS.map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="px-5 py-3 text-foreground">{row.item}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{row.retail}</td>
                  <td className="px-5 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                    {row.member === "Included" || row.member === "Waived" ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {row.member}
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
          <h3 className="text-lg font-bold text-foreground mb-4">A Few Honest Notes</h3>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              We'll do everything we can to keep your drain lines clear — cleaning and treatment at every visit. 
              That said, we don't warranty drain lines or guarantee against clogs. Drain systems can fail between 
              visits for reasons outside our control, and we'd rather be upfront about that than promise something we can't control.
            </p>
            <p>
              Filter replacement is included in every visit — just have your filter ready when we arrive.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="max-w-4xl mx-auto px-4 py-14 text-center">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-10">
          <TrendingUp className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Ready to Join?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Lock in your rate today and never worry about your system again.
          </p>
          <Button
            size="lg"
            onClick={handleEnroll}
            disabled={enrolling}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-10 shadow-lg shadow-emerald-600/25"
          >
            {enrolling ? "Submitting..." : `Enroll Now — $${plan.price}/year`}
          </Button>
        </div>
      </section>

      {/* ── Sticky bar ── */}
      <div className="sticky bottom-0 z-50 bg-card/95 backdrop-blur border-t p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{plan.name}</p>
            <p className="text-xs text-muted-foreground">${halfPrice}/visit · Rate locked for life</p>
          </div>
          <Button
            size="lg"
            onClick={handleEnroll}
            disabled={enrolling}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg"
          >
            {enrolling ? "Submitting..." : "Enroll Now →"}
          </Button>
        </div>
      </div>

      <BrochureFooter expiresAt={null} />
    </div>
  );
}
