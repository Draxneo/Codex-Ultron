import { User, Phone, FileText, Loader2, Check, Search } from "lucide-react";
import { AddressLink } from "@/components/AddressLink";
import { Button } from "@/components/ui/button";

export type ParsedCustomer = {
  first_name: string;
  last_name: string;
  mobile_number: string;
  email?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  notes?: string;
  job_description?: string;
};

export type ExistingCustomerMatch = {
  id: string;
  first_name: string;
  last_name: string;
  mobile_number: string;
  email: string;
  address: string;
  address_id: string;
  match_reason?: string;
};

type Props = {
  customer: ParsedCustomer;
  existingMatches?: ExistingCustomerMatch[];
  onConfirm: () => void;
  onUseExisting?: (match: ExistingCustomerMatch) => void;
  loading?: boolean;
  created?: boolean;
};

export function CustomerPreviewCard({ customer, existingMatches, onConfirm, onUseExisting, loading, created }: Props) {
  return (
    <div className="bg-card border border-primary/20 rounded-lg p-3 space-y-2 text-xs">
      {/* Existing matches warning */}
      {existingMatches && existingMatches.length > 0 && !created && (
        <div className="bg-accent/10 border border-accent/20 rounded-md p-2 space-y-1.5">
          <p className="font-semibold text-[10px] uppercase tracking-wide text-accent-foreground flex items-center gap-1">
            <Search className="h-3 w-3" /> Possible Matches ({existingMatches.length})
          </p>
          {existingMatches.map((match) => (
            <div key={match.id} className="flex items-center justify-between gap-2 bg-background/50 rounded p-1.5">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {match.first_name} {match.last_name}
                  <span className="ml-1.5 text-[9px] font-normal text-muted-foreground uppercase">
                    {match.match_reason === "address" ? "📍 address match" : "👤 name/phone"}
                  </span>
                </p>
                <p className="text-muted-foreground truncate">
                  {match.address || match.mobile_number}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] h-6 px-2 shrink-0"
                onClick={() => onUseExisting?.(match)}
                disabled={loading}
              >
                Use This
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="font-semibold text-[10px] uppercase tracking-wide text-primary">
        New Customer Preview
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium">{customer.first_name} {customer.last_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
          <span>{customer.mobile_number}</span>
        </div>
        <AddressLink
          address={`${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`}
          className="text-xs"
          iconClassName="h-3 w-3"
        />
        {(customer.notes || customer.job_description) && (
          <div className="flex items-start gap-2">
            <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{customer.notes || customer.job_description}</span>
          </div>
        )}
      </div>
      {!created ? (
        <Button
          size="sm"
          className="w-full text-xs h-7"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Creating...</>
          ) : (
            "Create New Customer"
          )}
        </Button>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-primary font-medium py-1">
          <Check className="h-3.5 w-3.5" /> Customer created
        </div>
      )}
    </div>
  );
}
