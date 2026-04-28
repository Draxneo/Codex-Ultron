/**
 * TechCustomerDetail.tsx - Minimal tech customer view for mobile.
 *
 * Shows customer header, contact icons, recent job history, and equipment.
 * Reuses existing hooks; deeper editing happens on dispatch UI.
 */

import { useNavigate, useParams, Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, MapPin, Phone, MessageSquare, Calendar, Wrench, ChevronRight } from "lucide-react";
import { useCustomer } from "@/hooks/useCustomers";
import { useCustomerJobs } from "@/hooks/useCustomerHistory";
import { useCustomerEquipment } from "@/hooks/useCustomerEquipment";
import { useCustomerAgreements } from "@/hooks/useServiceAgreements";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StreetViewThumbnail } from "@/components/tech/StreetViewThumbnail";
import { format, parseISO } from "date-fns";

export default function TechCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isNative } = useCapacitor();
  const softphone = useSoftphoneContext();
  const telephony = useTelephonyMode();
  const { data: customer, isLoading, isError } = useCustomer(id);
  const { data: jobs } = useCustomerJobs(id);
  const { data: equipment } = useCustomerEquipment(id);
  const { data: agreements } = useCustomerAgreements(id);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <header className="sticky top-0 z-20 flex items-center px-2 h-12 bg-card border-b border-border">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-foreground">Customer not found</p>
          </div>
          <div className="w-9" />
        </header>
        <main className="px-6 py-16 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h1 className="text-lg font-semibold">Customer not found</h1>
          <p className="text-sm text-muted-foreground mt-2">This customer may have been deleted, moved, or the link is invalid.</p>
        </main>
      </div>
    );
  }

  const fullName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || "Unknown";
  const phone = customer.mobile_phone || customer.phone || null;
  const address = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col min-h-full bg-background pb-24">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center px-2 h-12 bg-card border-b border-border">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-foreground truncate px-2">{fullName}</p>
        </div>
        <div className="w-9" />
      </header>

      <main className="px-3 pt-3 space-y-3 max-w-2xl mx-auto w-full">
        {/* Property card */}
        <Card className="overflow-hidden">
          <StreetViewThumbnail address={address || null} className="rounded-none" />
          <div className="p-4 space-y-3">
            <div>
              <p className="text-base font-semibold text-foreground">{fullName}</p>
              {customer.company && customer.company !== fullName && (
                <p className="text-xs text-muted-foreground">{customer.company}</p>
              )}
              {customer.hcp_customer_id && !isNative && (
                <a
                  href={`https://pro.housecallpro.com/app/customers/${customer.hcp_customer_id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-[11px] text-primary hover:underline hidden md:inline"
                >
                  HCP source
                </a>
              )}
            </div>

            {phone && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => softphone.dial?.(phone, [customer.first_name, customer.last_name].filter(Boolean).join(" ") || undefined)}
                  className="flex-1 flex items-center gap-2 h-10 px-3 rounded-md bg-primary/10 text-primary text-sm font-medium active:bg-primary/20"
                >
                  <Phone className="h-4 w-4" /> {phone}
                </button>
                <Link
                  to={`/sms?phone=${encodeURIComponent(phone)}`}
                  className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center"
                  aria-label="Send SMS"
                >
                  <MessageSquare className="h-4 w-4" />
                </Link>
              </div>
            )}

            {address && (
              <div className="flex items-start gap-2 text-sm text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{address}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Service Plans */}
        {agreements && agreements.length > 0 && (
          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Service Plans
            </h3>
            <ul className="space-y-1.5 text-sm">
              {agreements.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span className="text-foreground">{a.plan_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.end_date ? format(parseISO(a.end_date), "MMM yyyy") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Equipment */}
        {equipment && equipment.length > 0 && (
          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Equipment
            </h3>
            <ul className="space-y-2 text-sm">
              {equipment.map((e: any) => (
                <li key={e.id} className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {e.brand} {e.model_number}
                  </span>
                  {e.serial_number && (
                    <span className="text-xs text-muted-foreground">S/N: {e.serial_number}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Job history */}
        <Card className="overflow-hidden">
          <div className="px-4 h-12 flex items-center border-b border-border">
            <Calendar className="h-4 w-4 text-primary mr-2" />
            <h3 className="text-sm font-semibold text-foreground">Job History</h3>
            {jobs && (
              <span className="ml-2 text-xs text-muted-foreground">({jobs.length})</span>
            )}
          </div>
          {!jobs?.length ? (
            <p className="p-4 text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <ul>
              {jobs.slice(0, 20).map((j: any) => (
                <li key={j.id}>
                  <Link
                    to={`/tech/jobs/${j.id}`}
                    className="flex items-center gap-2 px-4 h-14 border-b border-border last:border-b-0 active:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {j.job_type || "Job"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {j.scheduled_date
                          ? format(parseISO(j.scheduled_date + "T00:00:00"), "MMM d, yyyy")
                          : "Unscheduled"}{" "}
                        · #{j.job_number || "—"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}
