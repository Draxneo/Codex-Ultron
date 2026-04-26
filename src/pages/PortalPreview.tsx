import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, DollarSign, Wrench, Gift, LogOut, Copy, ExternalLink, CheckCircle, ArrowLeft, Shield, Phone, Mail, ClipboardCheck, MessageSquare } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { formatDateShort } from "@/lib/formatters";

const sampleJobs = [
  { id: "1", job_number: "1042", job_type: "install", status: "completed", scheduled_date: "2026-02-15" },
  { id: "2", job_number: "1087", job_type: "maintenance", status: "scheduled", scheduled_date: "2026-03-22" },
  { id: "3", job_number: "1103", job_type: "service", status: "in_progress", scheduled_date: "2026-03-08" },
];

const sampleInvoices = [
  { id: "1", job_number: "1042", total: 8750, status: "paid", stripe_checkout_url: null },
  { id: "2", job_number: "1087", total: 249, status: "sent", stripe_checkout_url: "#" },
];

const sampleEquipment = [
  { id: "1", equipment_type: "air_conditioner", brand: "Carrier", model_number: "24ACC636A003", serial_number: "2623G45891" },
  { id: "2", equipment_type: "furnace", brand: "Carrier", model_number: "58STA090-1-12", serial_number: "4523A98721" },
  { id: "3", equipment_type: "thermostat", brand: "Ecobee", model_number: "Smart Premium", serial_number: null },
];

const sampleReferrals = [
  { id: "1", referred_name: "Mike Johnson", status: "converted", bonus_awarded: true, created_at: "2026-01-15T00:00:00Z" },
  { id: "2", referred_name: "Sarah Williams", status: "contacted", bonus_awarded: false, created_at: "2026-02-28T00:00:00Z" },
];

const sampleAgreements = [
  {
    id: "1",
    plan_name: "Gold Maintenance Plan",
    plan_type: "premium",
    frequency: "biannual",
    price: 299,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "active",
    notes: null,
  },
];

import { PORTAL_STATUS_COLORS as statusColor } from "@/lib/statusColors";

export default function PortalPreview() {
  const isMobile = useIsMobile();
  const [refSubmitted, setRefSubmitted] = useState(false);
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;

  const formatDate = (d: string) => formatDateShort(d);

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <Badge variant="secondary" className="mb-4">Preview Mode — Sample Data</Badge>
      </div>

      {/* Portal UI starts here */}
      <div className="min-h-[80vh]" style={{ background: "hsl(210, 20%, 98%)" }}>
        {/* Branded Header */}
        <div className="bg-gradient-to-r from-[hsl(213,60%,14%)] to-[hsl(213,55%,22%)] px-4 py-5">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-[hsl(35,92%,52%)]" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>Welcome, Jane Smith</h1>
                <p className="text-xs text-white/60">{companyName} — Customer Portal</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled className="text-white/70 hover:text-white hover:bg-white/10">
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-3 flex gap-4">
            <div className="flex-1 text-center">
              <p className="text-lg font-bold text-[hsl(213,55%,22%)]">3</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Jobs</p>
            </div>
            <div className="flex-1 text-center border-x">
              <p className="text-lg font-bold text-[hsl(152,69%,31%)]">$8,750</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paid</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-lg font-bold text-[hsl(35,92%,52%)]">2</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Equipment</p>
            </div>
            <div className="flex-1 text-center border-l">
              <p className="text-lg font-bold text-[hsl(205,85%,55%)]">1</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Referrals</p>
            </div>
          </div>
        </div>

        <main className="max-w-2xl mx-auto p-4">
          <Tabs defaultValue="jobs">
            <TabsList className="w-full grid grid-cols-5 bg-[hsl(213,55%,22%)]/5">
              <TabsTrigger value="jobs" className="text-xs gap-1 data-[state=active]:bg-[hsl(213,55%,22%)] data-[state=active]:text-white"><Briefcase className="h-3.5 w-3.5" /> Jobs</TabsTrigger>
              <TabsTrigger value="invoices" className="text-xs gap-1 data-[state=active]:bg-[hsl(213,55%,22%)] data-[state=active]:text-white"><DollarSign className="h-3.5 w-3.5" /> Invoices</TabsTrigger>
              <TabsTrigger value="plan" className="text-xs gap-1 data-[state=active]:bg-[hsl(213,55%,22%)] data-[state=active]:text-white"><ClipboardCheck className="h-3.5 w-3.5" /> Plan</TabsTrigger>
              <TabsTrigger value="equipment" className="text-xs gap-1 data-[state=active]:bg-[hsl(213,55%,22%)] data-[state=active]:text-white"><Wrench className="h-3.5 w-3.5" /> Equipment</TabsTrigger>
              <TabsTrigger value="referrals" className="text-xs gap-1 data-[state=active]:bg-[hsl(213,55%,22%)] data-[state=active]:text-white"><Gift className="h-3.5 w-3.5" /> Refer</TabsTrigger>
            </TabsList>

            {/* Jobs Tab */}
            <TabsContent value="jobs" className="space-y-3 mt-4">
              {sampleJobs.map(job => (
                <Card key={job.id} className="p-0 overflow-hidden border-l-4 border-l-[hsl(213,55%,22%)] shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[hsl(213,55%,22%)]">#{job.job_number}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColor[job.status] || "bg-muted text-muted-foreground"}`}>
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3">
                      <span>{formatDate(job.scheduled_date)}</span>
                      <span className="capitalize font-medium text-[hsl(215,35%,15%)]">{job.job_type}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices" className="space-y-3 mt-4">
              {sampleInvoices.map(inv => (
                <Card key={inv.id} className="p-0 overflow-hidden border-l-4 border-l-[hsl(152,69%,31%)] shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[hsl(213,55%,22%)]">Job #{inv.job_number}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColor[inv.status] || "bg-muted text-muted-foreground"}`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-base font-bold text-[hsl(213,55%,22%)]">${Number(inv.total).toLocaleString()}</span>
                      {inv.status !== "paid" && inv.stripe_checkout_url && (
                        <span className="text-xs font-semibold text-[hsl(35,92%,52%)] flex items-center gap-1 cursor-pointer hover:underline">
                          <ExternalLink className="h-3 w-3" /> Pay Now
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>

            {/* Equipment Tab */}
            <TabsContent value="equipment" className="space-y-3 mt-4">
              {sampleEquipment.map(eq => (
                <Card key={eq.id} className="p-0 overflow-hidden border-l-4 border-l-[hsl(205,85%,55%)] shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[hsl(213,55%,22%)] capitalize">{eq.equipment_type.replace(/_/g, " ")}</span>
                      {eq.brand && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[hsl(205,85%,92%)] text-[hsl(205,85%,35%)] border border-[hsl(205,60%,80%)]">{eq.brand}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5">
                      {eq.model_number && <span>Model: <span className="font-mono text-[hsl(215,35%,15%)]">{eq.model_number}</span></span>}
                      {eq.serial_number && <span className="ml-3">Serial: <span className="font-mono text-[hsl(215,35%,15%)]">{eq.serial_number}</span></span>}
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>

            {/* Maintenance Plan Tab */}
            <TabsContent value="plan" className="space-y-3 mt-4">
              {sampleAgreements.map(a => {
                const totalVisits = a.frequency === "biannual" ? 2 : 1;
                const completed = 1;
                const remaining = totalVisits - completed;
                const pct = Math.round((completed / totalVisits) * 100);
                return (
                  <Card key={a.id} className="p-0 overflow-hidden border-l-4 border-l-[hsl(152,69%,31%)] shadow-sm">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-[hsl(213,55%,22%)]">{a.plan_name}</h3>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {a.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {formatDate(a.start_date)} — {formatDate(a.end_date)} · {a.frequency}
                      </p>

                      {/* Visit Progress */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-[hsl(213,55%,22%)]">Visits Used</span>
                          <span className="font-bold text-[hsl(213,55%,22%)]">{completed} / {totalVisits}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div className="bg-[hsl(152,69%,31%)] h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {remaining > 0 ? `${remaining} visit${remaining !== 1 ? "s" : ""} remaining this period` : "All visits completed!"}
                        </p>
                      </div>

                      {/* Benefits */}
                      <div className="bg-[hsl(213,55%,22%)]/5 rounded-lg p-3">
                        <p className="text-xs font-bold text-[hsl(213,55%,22%)] mb-1.5">Plan Benefits:</p>
                        <ul className="text-xs text-muted-foreground space-y-1.5">
                          <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(152,69%,31%)] shrink-0" /> Priority scheduling</li>
                          <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(152,69%,31%)] shrink-0" /> Spring & Fall tune-ups</li>
                          <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(152,69%,31%)] shrink-0" /> 15% discount on repairs</li>
                          <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(152,69%,31%)] shrink-0" /> No overtime charges</li>
                          <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(152,69%,31%)] shrink-0" /> Extended equipment warranty</li>
                        </ul>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </TabsContent>

            {/* Referral Tab */}
            <TabsContent value="referrals" className="space-y-4 mt-4">
              <Card className="p-0 overflow-hidden border-t-4 border-t-[hsl(35,92%,52%)] shadow-sm">
                <div className="p-4 bg-gradient-to-br from-[hsl(35,90%,95%)] to-white">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-[hsl(213,55%,22%)]">Your Referral Code</h3>
                    <span className="font-mono text-sm font-bold px-3 py-1 rounded-md bg-[hsl(35,92%,52%)] text-white">SMITH7482</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Share your code and earn a <strong className="text-[hsl(35,92%,52%)]">$50 credit</strong> for each referral that books a job!
                  </p>
                  <Button variant="outline" size="sm" className="w-full border-[hsl(35,92%,52%)] text-[hsl(35,80%,35%)] hover:bg-[hsl(35,90%,95%)]">
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy Referral Link
                  </Button>
                  <p className="text-xs text-[hsl(152,69%,31%)] font-semibold mt-2 text-center">
                    🎉 You've earned 1 bonus!
                  </p>
                </div>
              </Card>

              <Card className="p-4 shadow-sm">
                <h3 className="text-sm font-bold text-[hsl(213,55%,22%)] mb-3">Refer a Friend</h3>
                {refSubmitted ? (
                  <div className="text-center py-4 space-y-2">
                    <CheckCircle className="h-8 w-8 text-[hsl(152,69%,31%)] mx-auto" />
                    <p className="text-sm font-semibold text-[hsl(213,55%,22%)]">Referral submitted!</p>
                    <Button variant="ghost" size="sm" onClick={() => setRefSubmitted(false)}>Submit another</Button>
                  </div>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); setRefSubmitted(true); }} className="space-y-3">
                    <div><Label className="text-xs font-medium">Friend's Name *</Label><Input className="mt-1" required /></div>
                    <div><Label className="text-xs font-medium">Phone</Label><Input className="mt-1" /></div>
                    <div><Label className="text-xs font-medium">Email</Label><Input className="mt-1" type="email" /></div>
                    <div><Label className="text-xs font-medium">Address</Label><Input className="mt-1" /></div>
                    <div><Label className="text-xs font-medium">What service do they need?</Label><Textarea className="mt-1" rows={2} /></div>
                    <Button type="submit" className="w-full bg-[hsl(213,55%,22%)] hover:bg-[hsl(213,45%,32%)] text-white">
                      <Gift className="h-4 w-4 mr-2" /> Submit Referral
                    </Button>
                  </form>
                )}
              </Card>

              <Card className="p-4 shadow-sm">
                <h3 className="text-sm font-bold text-[hsl(213,55%,22%)] mb-2">Referral History</h3>
                <div className="space-y-2">
                  {sampleReferrals.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div>
                        <span className="font-medium text-[hsl(215,35%,15%)]">{r.referred_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{formatDate(r.created_at)}</span>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${r.bonus_awarded ? statusColor.paid : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                        {r.bonus_awarded ? "Bonus Paid" : r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </main>

        {/* Footer */}
        <div className="bg-[hsl(213,60%,14%)] py-4 mt-8">
          <div className="max-w-2xl mx-auto px-4 flex items-center justify-between">
            <p className="text-xs text-white/50">© {new Date().getFullYear()} {companyName}</p>
            <div className="flex items-center gap-3 text-white/50">
              <Phone className="h-3.5 w-3.5" />
              <Mail className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        {/* Mock Copilot FAB */}
        <div className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg flex items-center justify-center bg-[hsl(213,55%,22%)] text-white cursor-pointer hover:scale-105 transition-transform">
          <MessageSquare className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
