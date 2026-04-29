import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarClock,
  Camera,
  ClipboardList,
  ExternalLink,
  FileText,
  HeartHandshake,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { useCustomerOverview, type CustomerOverview } from "@/hooks/useCustomerOverview";
import { useCustomerAgreements } from "@/hooks/useServiceAgreements";
import { useCertificatesForCustomer } from "@/hooks/useCertificates";
import { CustomerHeaderV2 } from "@/components/customer-v2/CustomerHeaderV2";
import { JobsTab } from "@/components/customer-v2/tabs/JobsTab";
import { EstimatesTab } from "@/components/customer-v2/tabs/EstimatesTab";
import { InvoicesTab } from "@/components/customer-v2/tabs/InvoicesTab";
import { CallsTab } from "@/components/customer-v2/tabs/CallsTab";
import { AttachmentsTab } from "@/components/customer-v2/tabs/AttachmentsTab";
import { UpcomingAppointments } from "@/components/customer-v2/main/UpcomingAppointments";
import { AddressesPanel } from "@/components/customer-v2/main/AddressesPanel";
import { PrivateNotesPanel } from "@/components/customer-v2/main/PrivateNotesPanel";
import { ActivityFeed } from "@/components/customer-v2/main/ActivityFeed";
import { CustomerSmsTab } from "@/components/SmsEmbedTab";
import { ClickToCall } from "@/components/ClickToCall";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const tabTriggerClass =
  "h-10 rounded-md px-4 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground";

function formatShortDate(value: string | null | undefined, fallback = "Not set") {
  if (!value) return fallback;
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return fallback;
  }
}

function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function customerName(customer: any) {
  return (
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    customer?.company ||
    "Unnamed customer"
  );
}

function customerAddress(customer: any, overview: CustomerOverview) {
  const primary = overview.addresses?.[0];
  const fromOverview = [
    primary?.street || primary?.address || primary?.line1,
    primary?.city,
    primary?.state,
    primary?.zip || primary?.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  const fromCustomer = [customer?.address, customer?.city, customer?.state, customer?.zip]
    .filter(Boolean)
    .join(", ");
  return fromOverview || fromCustomer || "No service address saved";
}

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: any;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RelationshipBrief({
  overview,
  customerId,
}: {
  overview: CustomerOverview;
  customerId: string;
}) {
  const c = overview.customer;
  const nextAppointment = overview.upcoming_appointments?.[0];
  const recentNote = overview.recent_notes?.[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Relationship Brief
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <BriefRow label="Lifetime value" value={money(overview.lifetime_value)} />
            <BriefRow label="Outstanding" value={money(overview.outstanding_balance)} />
            <BriefRow label="Jobs completed" value={`${Number(overview.job_count || 0)}`} />
            <BriefRow label="Last visit" value={formatShortDate(overview.last_job_date)} />
            <BriefRow
              label="Install history"
              value={overview.has_install ? "Has install record" : "No install record yet"}
            />
            <BriefRow
              label="Tags"
              value={overview.tag_list?.length ? overview.tag_list.join(", ") : "No tags"}
            />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              One-Click Follow Up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-start gap-2" variant="outline">
              <CalendarClock className="h-4 w-4" />
              Queue maintenance reminder
            </Button>
            <Button className="w-full justify-start gap-2" variant="outline">
              <HeartHandshake className="h-4 w-4" />
              Review Comfort Club renewal
            </Button>
            <Button className="w-full justify-start gap-2" variant="outline">
              <BadgeDollarSign className="h-4 w-4" />
              Mark replacement opportunity
            </Button>
            <p className="pt-1 text-xs text-muted-foreground">
              These are approval buttons for the next rebuild pass. No customer-facing action is sent automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current Context</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <MiniContext
              label="Next appointment"
              value={
                nextAppointment?.scheduled_date
                  ? formatShortDate(nextAppointment.scheduled_date)
                  : "None scheduled"
              }
              detail={nextAppointment?.job_type || nextAppointment?.description || "No active visit on the calendar"}
            />
            <MiniContext
              label="Address"
              value={customerAddress(c, overview)}
              detail="Primary service location for dispatch, service history, and warranty context"
            />
            <MiniContext
              label="Latest note"
              value={recentNote?.body || "No recent note"}
              detail={recentNote?.created_at ? formatShortDate(recentNote.created_at) : "Private customer memory"}
            />
          </CardContent>
        </Card>

        <UpcomingAppointments appointments={overview.upcoming_appointments || []} />
        <AddressesPanel addresses={overview.addresses || []} customer={c} />
        <PrivateNotesPanel customerId={customerId} />
        <ActivityFeed customerId={customerId} />
      </div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function MiniContext({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function CommunicationsPanel({
  customerId,
  fullName,
  phones,
}: {
  customerId: string;
  fullName: string;
  phones: string[];
}) {
  const navigate = useNavigate();
  const primaryPhone = phones[0];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" />
            Text Messages
          </CardTitle>
          {primaryPhone && (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/sms?phone=${encodeURIComponent(primaryPhone)}`)}
            >
              <ExternalLink className="h-4 w-4" />
              Open SMS
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {phones.length ? (
            <CustomerSmsTab phones={phones} />
          ) : (
            <p className="px-4 pb-5 text-sm text-muted-foreground">No phone number saved for SMS history.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" />
            Phone Calls
          </CardTitle>
          {primaryPhone && (
            <ClickToCall phone={primaryPhone} customerId={customerId} contactName={fullName}>
              <Button size="sm" variant="outline" className="gap-2">
                <Phone className="h-4 w-4" />
                Call
              </Button>
            </ClickToCall>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <CallsTab customerId={customerId} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProtectionPanel({
  customerId,
  overview,
}: {
  customerId: string;
  overview: CustomerOverview;
}) {
  const { data: agreements = [], isLoading: agreementsLoading } = useCustomerAgreements(customerId);
  const { data: certificates = [], isLoading: certificatesLoading } = useCertificatesForCustomer(customerId);
  const activeAgreement = agreements.find((a) => a.status === "active") || agreements[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshake className="h-4 w-4 text-primary" />
            Comfort Club
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agreementsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : activeAgreement ? (
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{activeAgreement.plan_name || overview.agreement?.plan_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {activeAgreement.visits_used || 0}/{activeAgreement.total_visits || 0} visits used
                  </p>
                </div>
                <Badge variant={activeAgreement.status === "active" ? "default" : "secondary"}>
                  {activeAgreement.status || "unknown"}
                </Badge>
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                <BriefRow label="Renews / expires" value={formatShortDate(activeAgreement.end_date)} />
                <BriefRow label="Discount" value={`${activeAgreement.agreement_discount_percent || 0}%`} />
                <BriefRow label="Source" value={activeAgreement.plan_source || "Not set"} />
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
              No Comfort Club agreement on this customer yet.
            </div>
          )}

          <Button className="w-full justify-start gap-2" variant="outline">
            <HeartHandshake className="h-4 w-4" />
            Prepare renewal or membership offer
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Warranty And Certificates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {certificatesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : certificates.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {certificates.map((cert) => (
                <div key={cert.id} className="rounded-md border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold capitalize">
                        {cert.certificate_type.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Generated {formatShortDate(cert.generated_at)}
                      </p>
                    </div>
                    <Badge variant="outline">tracked</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                    <span>Brand: {cert.data_snapshot?.brand || "Not recorded"}</span>
                    <span>Model: {cert.data_snapshot?.model || "Not recorded"}</span>
                    <span>
                      Warranty:{" "}
                      {cert.data_snapshot?.warrantyYears
                        ? `${cert.data_snapshot.warrantyYears} years`
                        : "Review certificate"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center">
              <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
              <p className="font-semibold">No warranty certificates yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Install certificates, labor warranty, parts warranty, and registration details will live here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState("snapshot");
  const { data: overview, isLoading, isError } = useCustomerOverview(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[1600px] space-y-4 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !overview || !id) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-background px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
        <main className="mx-auto max-w-xl px-6 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h1 className="text-xl font-semibold">Customer not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This customer may have been deleted, moved, or the link is invalid.
          </p>
        </main>
      </div>
    );
  }

  const c = overview.customer;
  const fullName = customerName(c);
  const phones = [c.phone, c.mobile_phone].filter(Boolean) as string[];
  const primaryPhone = phones[0];
  const primaryEmail = c.email || "No email saved";
  const serviceAddress = customerAddress(c, overview);
  const agreementStatus =
    overview.agreement?.status === "active"
      ? `${overview.agreement.plan_name || "Comfort Club"} active`
      : "No active Comfort Club";

  return (
    <div className="min-h-screen bg-muted/20">
      <CustomerHeaderV2
        customerId={id}
        fullName={fullName}
        outstandingBalance={Number(overview.outstanding_balance || 0)}
        primaryPhone={primaryPhone}
        customer={c}
      />

      <main className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
        <section className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Customer HQ</h1>
                <Badge variant="secondary">Relationship Memory</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Who, what, when, where, and why for the whole customer relationship.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {primaryPhone && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate(`/sms?phone=${encodeURIComponent(primaryPhone)}`)}
                >
                  <MessageSquare className="h-4 w-4" />
                  Text
                </Button>
              )}
              {primaryPhone && (
                <ClickToCall phone={primaryPhone} customerId={id} contactName={fullName}>
                  <Button variant="outline" className="gap-2">
                    <Phone className="h-4 w-4" />
                    Call
                  </Button>
                </ClickToCall>
              )}
              <Button className="gap-2" onClick={() => navigate(`/intake?customerId=${id}`)}>
                <Sparkles className="h-4 w-4" />
                Open in Intake
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SignalCard
              icon={UserRound}
              label="Who"
              value={fullName}
              detail={[primaryPhone, primaryEmail].filter(Boolean).join(" | ")}
            />
            <SignalCard
              icon={BriefcaseBusiness}
              label="What"
              value={`${Number(overview.job_count || 0)} jobs, ${money(overview.lifetime_value)}`}
              detail={overview.has_install ? "Includes installation history" : "Service relationship history"}
            />
            <SignalCard
              icon={CalendarClock}
              label="When"
              value={formatShortDate(overview.last_job_date, "No completed visit")}
              detail={overview.upcoming_appointments?.length ? "Has upcoming work" : "No upcoming appointment"}
            />
            <SignalCard icon={MapPin} label="Where" value={serviceAddress} detail="Primary dispatch context" />
            <SignalCard
              icon={HeartHandshake}
              label="Why"
              value={agreementStatus}
              detail="Retention, warranty, remarketing, and renewal context"
            />
          </div>
        </section>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <div className="overflow-x-auto rounded-lg border bg-background p-2">
            <TabsList className="h-auto justify-start gap-1 bg-transparent p-0">
              <TabsTrigger value="snapshot" className={tabTriggerClass}>Snapshot</TabsTrigger>
              <TabsTrigger value="work" className={tabTriggerClass}>Work</TabsTrigger>
              <TabsTrigger value="communications" className={tabTriggerClass}>Calls + SMS</TabsTrigger>
              <TabsTrigger value="files" className={tabTriggerClass}>Files</TabsTrigger>
              <TabsTrigger value="protection" className={tabTriggerClass}>Protection</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="snapshot" className="mt-0">
            <RelationshipBrief overview={overview} customerId={id} />
          </TabsContent>

          <TabsContent value="work" className="mt-0">
            <div className="space-y-4">
              <Card className="shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-primary" />
                    Proposed, Sold, And Billed Work
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <MiniContext label="Estimates" value="Customer proposals" detail="Quotes and options we have presented" />
                  <MiniContext label="Jobs" value="Completed and active work" detail="Service, maintenance, install, and repair history" />
                  <MiniContext label="Invoices" value="Payment memory" detail="Paid, open, and overdue customer billing" />
                </CardContent>
              </Card>
              <EstimatesTab customerId={id} />
              <JobsTab customerId={id} />
              <InvoicesTab customerId={id} />
            </div>
          </TabsContent>

          <TabsContent value="communications" className="mt-0">
            <CommunicationsPanel customerId={id} fullName={fullName} phones={phones} />
          </TabsContent>

          <TabsContent value="files" className="mt-0">
            <Card className="mb-4 shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold">All customer attachments</p>
                  <p className="text-sm text-muted-foreground">
                    Photos and files from jobs, estimates, tech forms, and archived Housecall Pro attachments.
                  </p>
                </div>
              </CardContent>
            </Card>
            <AttachmentsTab customerId={id} />
          </TabsContent>

          <TabsContent value="protection" className="mt-0">
            <ProtectionPanel customerId={id} overview={overview} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
