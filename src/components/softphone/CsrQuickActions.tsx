import { useState } from "react";
import { UserPlus, Search, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewJobDialog } from "@/components/NewJobDialog";

interface CsrQuickActionsProps {
  phoneNumber?: string;
  callerName?: string;
  customerId?: string;
}

export function CsrQuickActions({ phoneNumber, callerName, customerId }: CsrQuickActionsProps) {
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>

      <div className="space-y-1.5">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-auto py-2.5 text-left"
          onClick={() => setShowNewCustomer(true)}
        >
          <UserPlus className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm">Create Customer</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-auto py-2.5 text-left"
          onClick={() => setShowNewJob(true)}
        >
          <Briefcase className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm">New Job</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-auto py-2.5 text-left"
          onClick={() => {
            if (customerId) {
              window.open(`/customers/${customerId}`, "_blank");
            } else if (phoneNumber) {
              window.open(`/customers?search=${encodeURIComponent(phoneNumber)}`, "_blank");
            }
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm">Look Up Customer</span>
        </Button>
      </div>

      <NewCustomerDialog
        open={showNewCustomer}
        onOpenChange={setShowNewCustomer}
        onCustomerCreated={() => setShowNewCustomer(false)}
      />
      <NewJobDialog open={showNewJob} onOpenChange={setShowNewJob} />
    </div>
  );
}
