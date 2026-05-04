import { MapPin, Home, Building2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddressLink } from "@/components/AddressLink";
import { useCustomerAddresses, useDeleteCustomerAddress, type CustomerAddress } from "@/hooks/useCustomerAddresses";

interface Props {
  customerId: string;
  onAddAddress?: () => void;
}

export function CustomerAddressList({ customerId, onAddAddress }: Props) {
  const { data: addresses, isLoading } = useCustomerAddresses(customerId);
  const deleteAddress = useDeleteCustomerAddress();

  if (isLoading) return null;
  if (!addresses || addresses.length === 0) return null;

  const billing = addresses.filter(a => a.is_primary || a.address_type === "billing");
  const rentals = addresses.filter(a => !a.is_primary && a.address_type !== "billing");

  const formatAddr = (a: CustomerAddress) =>
    [a.street, a.street_line_2, a.city, a.state, a.zip].filter(Boolean).join(", ");

  return (
    <div className="space-y-3">
      {/* Primary / Billing */}
      {billing.map(a => (
        <Card key={a.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Home className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-foreground">Home Address</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Primary</Badge>
                </div>
                <AddressLink address={formatAddr(a)} className="text-xs text-muted-foreground" />
              </div>
            </div>
          </div>
        </Card>
      ))}

      {/* Rental Properties */}
      {rentals.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Rental Properties ({rentals.length})
          </h4>
          <div className="space-y-2">
            {rentals.map(a => (
              <Card key={a.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <AddressLink address={formatAddr(a)} className="text-xs text-foreground" />
                      {a.street_line_2 && (
                        <p className="text-[11px] text-muted-foreground">{a.street_line_2}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteAddress.mutate({ id: a.id, customer_id: customerId })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
