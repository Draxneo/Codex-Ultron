import { useParams } from "react-router-dom";
import { useState } from "react";
import { useCustomerOverview } from "@/hooks/useCustomerOverview";
import { CustomerHeaderV2 } from "@/components/customer-v2/CustomerHeaderV2";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileTab } from "@/components/customer-v2/tabs/ProfileTab";
import { JobsTab } from "@/components/customer-v2/tabs/JobsTab";
import { EstimatesTab } from "@/components/customer-v2/tabs/EstimatesTab";
import { InvoicesTab } from "@/components/customer-v2/tabs/InvoicesTab";
import { CallsTab } from "@/components/customer-v2/tabs/CallsTab";
import { AttachmentsTab } from "@/components/customer-v2/tabs/AttachmentsTab";
import { NotesTab } from "@/components/customer-v2/tabs/NotesTab";
import { LeadsTab } from "@/components/customer-v2/tabs/LeadsTab";

const tabTriggerClass =
  "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-semibold uppercase tracking-wide";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState("profile");
  const { data: overview, isLoading } = useCustomerOverview(id);

  if (isLoading || !overview) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-[1600px] mx-auto p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  const c = overview.customer;
  const fullName =
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.company ||
    "Unnamed customer";

  return (
    <div className="min-h-screen bg-muted/20">
      <CustomerHeaderV2
        customerId={id!}
        fullName={fullName}
        outstandingBalance={Number(overview.outstanding_balance || 0)}
        primaryPhone={c.phone || c.mobile_phone}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="border-b bg-background">
          <div className="max-w-[1600px] mx-auto">
            <TabsList className="w-full justify-start px-4 bg-transparent rounded-none h-auto p-0 gap-0 overflow-x-auto">
              <TabsTrigger value="profile" className={tabTriggerClass}>Profile</TabsTrigger>
              <TabsTrigger value="leads" className={tabTriggerClass}>Leads</TabsTrigger>
              <TabsTrigger value="estimates" className={tabTriggerClass}>Estimates</TabsTrigger>
              <TabsTrigger value="jobs" className={tabTriggerClass}>Jobs</TabsTrigger>
              <TabsTrigger value="invoices" className={tabTriggerClass}>Invoices</TabsTrigger>
              <TabsTrigger value="calls" className={tabTriggerClass}>Calls</TabsTrigger>
              <TabsTrigger value="attachments" className={tabTriggerClass}>Attachments</TabsTrigger>
              <TabsTrigger value="notes" className={tabTriggerClass}>Notes</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-6 py-5">
          <TabsContent value="profile" className="mt-0">
            <ProfileTab customerId={id!} overview={overview} />
          </TabsContent>
          <TabsContent value="leads" className="mt-0"><LeadsTab customerId={id!} /></TabsContent>
          <TabsContent value="estimates" className="mt-0"><EstimatesTab customerId={id!} /></TabsContent>
          <TabsContent value="jobs" className="mt-0"><JobsTab customerId={id!} /></TabsContent>
          <TabsContent value="invoices" className="mt-0"><InvoicesTab customerId={id!} /></TabsContent>
          <TabsContent value="calls" className="mt-0"><CallsTab customerId={id!} /></TabsContent>
          <TabsContent value="attachments" className="mt-0"><AttachmentsTab customerId={id!} /></TabsContent>
          <TabsContent value="notes" className="mt-0"><NotesTab customerId={id!} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
