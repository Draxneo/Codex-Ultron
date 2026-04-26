import { Card } from "@/components/ui/card";
import { PropertyCard } from "@/components/PropertyCard";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { AddressLink } from "@/components/AddressLink";
import { Mail, MapPin, Bell, CreditCard, User, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  customerName: string;
  customerId?: string | null;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  notificationsEnabled?: boolean;
  hasCardOnFile?: boolean;
}

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0 truncate">{children}</div>
    </div>
  );
}

export function JobV2CustomerCard({
  customerName,
  customerId,
  customerPhone,
  customerEmail,
  customerAddress,
  notificationsEnabled,
  hasCardOnFile,
}: Props) {
  return (
    <Card className="overflow-hidden">
      {/* Property hero */}
      {customerAddress && <PropertyCard address={customerAddress} />}

      <div className="p-4 space-y-1 border-t">
        {/* Name + customer link */}
        <Row icon={User}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{customerName}</span>
            {customerId && (
              <Link
                to={`/customers/${customerId}`}
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                Details <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </Row>

        {customerAddress && (
          <Row icon={MapPin}>
            <AddressLink address={customerAddress} className="text-sm" />
          </Row>
        )}

        {customerPhone && (
          <div className="flex items-center gap-2 py-1.5">
            <ClickToCall
              phone={customerPhone}
              contactName={customerName}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors flex-1 min-w-0"
              iconClassName="h-3.5 w-3.5 text-muted-foreground shrink-0"
            />
            <SmsButton phone={customerPhone} iconClassName="h-3.5 w-3.5" />
          </div>
        )}

        {customerEmail && (
          <Row icon={Mail}>
            <a href={`mailto:${customerEmail}`} className="text-sm hover:text-primary truncate block">
              {customerEmail}
            </a>
          </Row>
        )}

        <div className="border-t pt-2 mt-2 space-y-1">
          <Row icon={Bell}>
            <span className="text-xs text-muted-foreground">
              Notifications: <span className="text-foreground font-medium">{notificationsEnabled ? "On" : "Off"}</span>
            </span>
          </Row>
          <Row icon={CreditCard}>
            <span className="text-xs text-muted-foreground">
              Card on file: <span className="text-foreground font-medium">{hasCardOnFile ? "Yes" : "None"}</span>
            </span>
          </Row>
        </div>
      </div>
    </Card>
  );
}
