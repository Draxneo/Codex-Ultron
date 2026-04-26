import { SummaryCard } from "../cards/SummaryCard";
import { ContactInfoCard } from "../cards/ContactInfoCard";
import { CustomerPortalCard } from "../cards/CustomerPortalCard";
import { PaymentMethodCard } from "../cards/PaymentMethodCard";
import { CommunicationPreferencesCard } from "../cards/CommunicationPreferencesCard";
import { CustomerTagsCard } from "../cards/CustomerTagsCard";
import { AttachmentsCard } from "../cards/AttachmentsCard";
import { LeadSourceCard } from "../cards/LeadSourceCard";
import { AutoInvoiceCard } from "../cards/AutoInvoiceCard";
import { UpcomingAppointments } from "../main/UpcomingAppointments";
import { AddressesPanel } from "../main/AddressesPanel";
import { PrivateNotesPanel } from "../main/PrivateNotesPanel";
import { ActivityFeed } from "../main/ActivityFeed";
import type { CustomerOverview } from "@/hooks/useCustomerOverview";

interface Props {
  customerId: string;
  overview: CustomerOverview;
}

export function ProfileTab({ customerId, overview }: Props) {
  const c = overview.customer;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      {/* Sidebar */}
      <aside className="space-y-4">
        <SummaryCard
          lifetimeValue={Number(overview.lifetime_value || 0)}
          outstandingBalance={Number(overview.outstanding_balance || 0)}
          jobCount={Number(overview.job_count || 0)}
          lastJobDate={overview.last_job_date}
        />
        <ContactInfoCard
          customerId={customerId}
          fullName={[c.first_name, c.last_name].filter(Boolean).join(" ") || c.company}
          phone={c.phone}
          mobile={c.mobile_phone}
          email={c.email}
          company={c.company}
        />
        <CustomerPortalCard customerId={customerId} email={c.email} />
        <PaymentMethodCard defaultPaymentMethodId={c.default_payment_method_id} />
        <CommunicationPreferencesCard
          customerId={customerId}
          notificationsEnabled={c.notifications_enabled ?? true}
          textConsent={c.text_consent ?? "opted_in"}
          emailConsent={c.email_consent ?? "opted_in"}
        />
        <CustomerTagsCard customerId={customerId} tags={overview.tag_list} />
        <AttachmentsCard customerId={customerId} />
        <LeadSourceCard customerId={customerId} leadSource={c.lead_source} />
        <AutoInvoiceCard customerId={customerId} enabled={c.auto_invoice_enabled ?? false} />
      </aside>

      {/* Main */}
      <main className="space-y-4 min-w-0">
        <UpcomingAppointments appointments={overview.upcoming_appointments || []} />
        <AddressesPanel addresses={overview.addresses || []} customer={c} />
        <PrivateNotesPanel customerId={customerId} />
        <ActivityFeed customerId={customerId} />
      </main>
    </div>
  );
}
