import { useState, useEffect } from "react";
import logo from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalSession } from "@/hooks/usePortalSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, DollarSign, Wrench, Gift, LogOut, Copy, ExternalLink, Loader2, CheckCircle, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import { useCompanySettings } from "@/hooks/useCompanySettings";

export default function PortalDashboard() {
  const { customerId, loading: sessionLoading, valid, logout } = usePortalSession();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || "Your Company";
  const [customer, setCustomer] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [referralCode, setReferralCode] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [agreementVisits, setAgreementVisits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Referral form
  const [refName, setRefName] = useState("");
  const [refPhone, setRefPhone] = useState("");
  const [refEmail, setRefEmail] = useState("");
  const [refAddress, setRefAddress] = useState("");
  const [refService, setRefService] = useState("");
  const [submittingRef, setSubmittingRef] = useState(false);
  const [refSubmitted, setRefSubmitted] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!valid || !customerId) {
      navigate("/portal/login");
      return;
    }
    loadData();
  }, [sessionLoading, valid, customerId]);

  const loadData = async () => {
    if (!customerId) return;
    const [custRes, jobsRes, eqRes, codeRes, agreeRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).single(),
      supabase.from("jobs").select("id, job_number, hcp_job_number, job_type, status, scheduled_date, address, customer_invoices(id, total, status, stripe_checkout_url)").eq("customer_id", customerId).order("scheduled_date", { ascending: false }).limit(50),
      supabase.from("customer_equipment").select("*").eq("customer_id", customerId),
      supabase.from("referral_codes").select("*").eq("customer_id", customerId).eq("is_active", true).limit(1).single(),
      supabase.from("service_agreements" as any).select("*").eq("customer_id", customerId).order("end_date", { ascending: false }),
    ]);
    setCustomer(custRes.data);
    setJobs(jobsRes.data || []);
    setEquipment(eqRes.data || []);
    setReferralCode(codeRes.data);
    const agreeData = (agreeRes.data || []) as any[];
    setAgreements(agreeData);

    // Load visits for active agreements
    const activeIds = agreeData.filter((a: any) => a.status === "active").map((a: any) => a.id);
    if (activeIds.length) {
      const { data: visits } = await supabase.from("agreement_visits" as any).select("agreement_id").in("agreement_id", activeIds);
      const counts: Record<string, number> = {};
      for (const v of (visits || []) as any[]) {
        counts[v.agreement_id] = (counts[v.agreement_id] || 0) + 1;
      }
      setAgreementVisits(counts);
    }

    // Flatten invoices from jobs
    const allInvoices = (jobsRes.data || []).flatMap((j: any) =>
      (j.customer_invoices || []).map((inv: any) => ({ ...inv, job_number: j.job_number || j.hcp_job_number }))
    );
    setInvoices(allInvoices);

    if (codeRes.data?.code) {
      const { data: refs } = await supabase.from("referrals")
        .select("*").eq("referrer_code", codeRes.data.code)
        .order("created_at", { ascending: false });
      setReferrals(refs || []);
    }
    setLoading(false);
  };

  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refName.trim() || !referralCode?.code) return;
    setSubmittingRef(true);
    await supabase.from("referrals").insert({
      referrer_code: referralCode.code,
      referred_name: refName,
      referred_phone: refPhone || null,
      referred_email: refEmail || null,
      referred_address: refAddress || null,
      service_needed: refService || null,
    });
    setSubmittingRef(false);
    setRefSubmitted(true);
    setRefName(""); setRefPhone(""); setRefEmail(""); setRefAddress(""); setRefService("");
    loadData();
    toast({ title: "Referral submitted!", description: "Thank you for the referral!" });
  };

  const copyReferralLink = () => {
    if (!referralCode?.code) return;
    const link = `${window.location.origin}/refer/${referralCode.code}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied!", description: "Share this with friends and family." });
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-muted/30 p-4">
        <div className="max-w-2xl mx-auto space-y-4 pt-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const displayName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : "Customer";
  const bonusCount = referrals.filter(r => r.bonus_awarded).length;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt={companyName} className="h-9 w-9 rounded" />
            <div>
              <h1 className="text-lg font-bold">Welcome, {displayName}</h1>
              <p className="text-xs text-muted-foreground">{companyName} Customer Portal</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { logout(); navigate("/portal/login"); }}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto p-4">
        <Tabs defaultValue="jobs">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="jobs" className="text-xs gap-1"><Briefcase className="h-3.5 w-3.5" /> Jobs</TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> Invoices</TabsTrigger>
            <TabsTrigger value="plan" className="text-xs gap-1"><ClipboardCheck className="h-3.5 w-3.5" /> Plan</TabsTrigger>
            <TabsTrigger value="equipment" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> Equipment</TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs gap-1"><Gift className="h-3.5 w-3.5" /> Refer</TabsTrigger>
          </TabsList>

          {/* Jobs Tab */}
          <TabsContent value="jobs" className="space-y-2 mt-4">
            {jobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No jobs on record</p>
            ) : jobs.map(job => (
              <Card key={job.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">#{job.job_number || job.hcp_job_number || "—"}</span>
                  <Badge variant="outline" className="text-xs capitalize">{job.status || "pending"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-x-3">
                  {job.scheduled_date && <span>{format(new Date(job.scheduled_date), "MMM d, yyyy")}</span>}
                  {job.job_type && <span className="capitalize">{job.job_type}</span>}
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-2 mt-4">
            {invoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No invoices</p>
            ) : invoices.map((inv: any) => (
              <Card key={inv.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Job #{inv.job_number}</span>
                  <Badge variant={inv.status === "paid" ? "default" : "secondary"} className="text-xs capitalize">{inv.status}</Badge>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-semibold">${Number(inv.total).toLocaleString()}</span>
                  {inv.status !== "paid" && inv.stripe_checkout_url && (
                    <a href={inv.stripe_checkout_url} target="_blank" rel="noopener" className="text-xs text-primary font-medium flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Pay Now
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipment" className="space-y-2 mt-4">
            {equipment.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No equipment on file</p>
            ) : equipment.map((eq: any) => (
              <Card key={eq.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{eq.equipment_type.replace(/_/g, " ")}</span>
                  {eq.brand && <Badge variant="outline" className="text-xs">{eq.brand}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {eq.model_number && <span>Model: {eq.model_number}</span>}
                  {eq.serial_number && <span className="ml-3">Serial: {eq.serial_number}</span>}
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* Referral Tab */}
          <TabsContent value="referrals" className="space-y-4 mt-4">
            {referralCode && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Your Referral Code</h3>
                  <Badge variant="secondary" className="font-mono text-sm">{referralCode.code}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Share your code and earn a {referralCode.bonus_type} for each referral that books a job!
                </p>
                <Button variant="outline" size="sm" className="w-full" onClick={copyReferralLink}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy Referral Link
                </Button>
                {bonusCount > 0 && (
                  <p className="text-xs text-primary font-medium mt-2 text-center">
                    🎉 You've earned {bonusCount} bonus{bonusCount !== 1 ? "es" : ""}!
                  </p>
                )}
              </Card>
            )}

            {/* Referral Form */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Refer a Friend</h3>
              {refSubmitted ? (
                <div className="text-center py-4 space-y-2">
                  <CheckCircle className="h-8 w-8 text-primary mx-auto" />
                  <p className="text-sm font-medium">Referral submitted!</p>
                  <Button variant="ghost" size="sm" onClick={() => setRefSubmitted(false)}>Submit another</Button>
                </div>
              ) : (
                <form onSubmit={handleSubmitReferral} className="space-y-3">
                  <div><Label className="text-xs">Friend's Name *</Label><Input value={refName} onChange={e => setRefName(e.target.value)} required /></div>
                  <div><Label className="text-xs">Phone</Label><Input value={refPhone} onChange={e => setRefPhone(e.target.value)} /></div>
                  <div><Label className="text-xs">Email</Label><Input type="email" value={refEmail} onChange={e => setRefEmail(e.target.value)} /></div>
                  <div><Label className="text-xs">Address</Label><Input value={refAddress} onChange={e => setRefAddress(e.target.value)} /></div>
                  <div><Label className="text-xs">What service do they need?</Label><Textarea value={refService} onChange={e => setRefService(e.target.value)} rows={2} /></div>
                  <Button type="submit" className="w-full" disabled={submittingRef}>
                    {submittingRef ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
                    Submit Referral
                  </Button>
                </form>
              )}
            </Card>

            {/* Referral History */}
            {referrals.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2">Referral History</h3>
                <div className="space-y-2">
                  {referrals.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div>
                        <span className="font-medium">{r.referred_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{format(new Date(r.created_at), "MMM d")}</span>
                      </div>
                      <Badge variant={r.status === "converted" || r.bonus_awarded ? "default" : "outline"} className="text-xs capitalize">
                        {r.bonus_awarded ? "Bonus Paid" : r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Maintenance Plan Tab */}
          <TabsContent value="plan" className="space-y-3 mt-4">
            {agreements.length === 0 ? (
              <Card className="p-6 text-center">
                <ClipboardCheck className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No maintenance plan on file</p>
                <p className="text-xs text-muted-foreground mt-1">Ask us about our maintenance plans to keep your system running efficiently!</p>
              </Card>
            ) : agreements.map((a: any) => {
              const frequencyToVisits: Record<string, number> = { annual: 1, biannual: 2, quarterly: 4, monthly: 12 };
              const totalVisits = frequencyToVisits[a.frequency] || 2;
              const completed = agreementVisits[a.id] || 0;
              const remaining = Math.max(0, totalVisits - completed);
              const pct = Math.round((completed / totalVisits) * 100);
              const isExpired = new Date(a.end_date) < new Date();

              return (
                <Card key={a.id} className="overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold">{a.plan_name}</h3>
                      <Badge variant={a.status === "active" ? "default" : "secondary"} className="text-xs capitalize">
                        {isExpired ? "expired" : a.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {format(new Date(a.start_date), "MMM d, yyyy")} — {format(new Date(a.end_date), "MMM d, yyyy")} · {a.frequency}
                    </p>

                    {/* Visit Progress */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">Visits Used</span>
                        <span className="font-semibold">{completed} / {totalVisits}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {remaining > 0 ? `${remaining} visit${remaining !== 1 ? "s" : ""} remaining` : "All visits completed!"}
                      </p>
                    </div>

                    {/* Benefits */}
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs font-semibold mb-1.5">Plan Benefits:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-primary shrink-0" /> Priority scheduling</li>
                        <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-primary shrink-0" /> {a.frequency === "biannual" ? "Spring & Fall" : a.frequency} tune-up{totalVisits > 1 ? "s" : ""}</li>
                        <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-primary shrink-0" /> 15% discount on repairs</li>
                        <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-primary shrink-0" /> No overtime charges</li>
                        <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-primary shrink-0" /> Extended equipment warranty</li>
                      </ul>
                    </div>

                    {a.notes && <p className="text-xs text-muted-foreground mt-2 italic">{a.notes}</p>}
                  </div>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}
