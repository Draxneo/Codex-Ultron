import { Card } from "@/components/ui/card";
import { CustomerCallsTab } from "@/components/CallLogEmbedTab";
import { useCustomer } from "@/hooks/useCustomers";

export function CallsTab({ customerId }: { customerId: string }) {
  const { data: customer } = useCustomer(customerId);
  const phones = [customer?.phone, customer?.mobile_phone].filter(Boolean) as string[];
  return (
    <Card className="shadow-none border p-4">
      <CustomerCallsTab phones={phones} customerId={customerId} />
    </Card>
  );
}
