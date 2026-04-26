import { Link } from "react-router-dom";
import { ChevronRight, Phone, Sparkles, MoreHorizontal, ArrowLeft, Store, ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";

interface Props {
  vendorId: string;
  name: string;
  accountNumber?: string | null;
  primaryPhone?: string | null;
  textSupportPhone?: string | null;
  orderingUrl?: string | null;
  websiteUrl?: string | null;
  brandAffinity?: string[] | null;
}

export function VendorHeaderV2({
  vendorId,
  name,
  accountNumber,
  primaryPhone,
  textSupportPhone,
  orderingUrl,
  websiteUrl,
  brandAffinity,
}: Props) {
  const { sendQuery } = useCopilotPanel();

  return (
    <div className="border-b bg-background">
      <div className="max-w-[1600px] mx-auto px-6 pt-4 pb-3">
        {/* Breadcrumb */}
        <div className="flex items-center text-sm text-muted-foreground mb-2">
          <Link to="/vendors" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Vendors
          </Link>
          <ChevronRight className="h-3.5 w-3.5 mx-1" />
          <span className="text-foreground font-medium">{name}</span>
        </div>

        {/* Name + actions row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Store className="h-5 w-5 text-amber-500" />
              {name}
            </h1>
            {accountNumber && (
              <Badge variant="outline" className="text-xs font-mono">
                Acct {accountNumber}
              </Badge>
            )}
            {brandAffinity?.slice(0, 4).map((b) => (
              <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {primaryPhone && (
              <ClickToCall phone={primaryPhone} contactName={name}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
              </ClickToCall>
            )}
            {textSupportPhone && (
              <SmsButton phone={textSupportPhone} className="hidden sm:inline-flex" />
            )}
            {orderingUrl && (
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <a href={orderingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Order portal
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => sendQuery(`Tell me about vendor ${name}`)}
            >
              <Sparkles className="h-4 w-4" />
              Ask AI
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {websiteUrl && (
                  <DropdownMenuItem asChild>
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer">Open website</a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive">Archive vendor</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
