import { Link } from "react-router-dom";
import { ChevronRight, Phone, MoreHorizontal, ArrowLeft, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClickToCall } from "@/components/ClickToCall";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AskJarvisButton } from "@/components/jarvis/AskJarvisButton";
import { CustomerEditDialog } from "./CustomerEditDialog";
import { openSmsComposer } from "@/lib/smsComposerBridge";

interface Props {
  customerId: string;
  fullName: string;
  outstandingBalance: number;
  primaryPhone?: string | null;
  customer?: any;
}

export function CustomerHeaderV2({ customerId, fullName, outstandingBalance, primaryPhone, customer }: Props) {
  return (
    <div className="border-b bg-background">
      <div className="max-w-[1600px] mx-auto px-6 pt-4 pb-3">
        {/* Breadcrumb */}
        <div className="flex items-center text-sm text-muted-foreground mb-2">
          <Link to="/customers" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Customers
          </Link>
          <ChevronRight className="h-3.5 w-3.5 mx-1" />
          <span className="text-foreground font-medium">{fullName}</span>
        </div>

        {/* Name + actions row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            {outstandingBalance > 0 && (
              <Badge variant="destructive" className="text-xs">
                ${outstandingBalance.toFixed(2)} outstanding
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {customer && <CustomerEditDialog customer={customer} />}
            {outstandingBalance > 0 && (
              <Button size="sm" variant="default" disabled title="Not wired yet">
                Payment button not ready yet
              </Button>
            )}
            {primaryPhone && (
              <ClickToCall phone={primaryPhone} customerId={customerId} contactName={fullName}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
              </ClickToCall>
            )}
            {primaryPhone && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  openSmsComposer(primaryPhone, { contactName: fullName, customerId });
                }}
              >
                <MessageSquare className="h-4 w-4" />
                Start SMS
              </Button>
            )}
            <AskJarvisButton
              contextType="customer"
              contextId={customerId}
              label="Ask JARVIS"
              context={{
                id: customerId,
                customer_id: customerId,
                customer_name: fullName,
                customer_phone: primaryPhone,
                email: customer?.email,
                address: customer?.address || [customer?.city, customer?.state, customer?.zip].filter(Boolean).join(", "),
                outstanding_balance: outstandingBalance,
                source: "customer_record",
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled className="text-destructive">Archive option not ready yet</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
