import { ReactNode } from "react";
import { User, Phone, Mail, MapPin } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { AddressLink } from "@/components/AddressLink";
import { CustomerStatusBadges, getAvatarColor } from "@/components/CustomerStatusBadges";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CustomerEnrichment } from "@/hooks/useCustomerEnrichment";

export type CustomerCardVariant = "list" | "dispatch" | "caller" | "preview";

interface CustomerCardProps {
  /** Customer data */
  customer: {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    mobile_phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  /** Enrichment data for badges/avatar color */
  enrichment?: CustomerEnrichment;
  /** Display variant */
  variant?: CustomerCardVariant;
  /** Show detail row on badges (agreement info, install date) */
  showBadgeDetail?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Extra content rendered below the card body (e.g. travel time, What's Next on dispatch) */
  children?: ReactNode;
  className?: string;
}

function displayName(c: CustomerCardProps["customer"]): string {
  if (c.first_name && c.last_name) return `${c.first_name} ${c.last_name}`;
  if (c.first_name) return c.first_name;
  if (c.last_name) return c.last_name;
  return c.company || "Unknown";
}

function initials(c: CustomerCardProps["customer"]): string {
  return `${(c.first_name?.[0] || "").toUpperCase()}${(c.last_name?.[0] || "").toUpperCase()}` || "?";
}

function fullAddress(c: CustomerCardProps["customer"]): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
}

/**
 * Unified CustomerCard — ONE way to display customers everywhere.
 *
 * Variants:
 * - "list"     → compact row for Customers page table/card views
 * - "dispatch" → job card on dispatch board (full context: avatar, name, badges, address, phone)
 * - "caller"   → softphone caller info center (full detail)
 * - "preview"  → new customer preview dialog
 */
export function CustomerCard({
  customer,
  enrichment,
  variant = "list",
  showBadgeDetail,
  onClick,
  children,
  className,
}: CustomerCardProps) {
  const c = customer;
  const avatarSize = variant === "dispatch" ? "h-6 w-6 text-[9px]" : variant === "caller" ? "h-10 w-10 text-xs" : "h-8 w-8 text-[11px]";
  const addr = fullAddress(c);
  const contactName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "Unknown";
  const contactPhone = c.phone || c.mobile_phone;

  // Dispatch variant — full context, compact layout, no card wrapper
  if (variant === "dispatch") {
    return (
      <div className={cn("space-y-0.5", className)}>
        {/* Name row */}
        <div className="flex items-center gap-1.5">
          <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", avatarSize, getAvatarColor(enrichment))}>
            {initials(c)}
          </div>
          <span className="text-[13px] font-bold text-foreground leading-tight break-words">
            {c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : displayName(c)}
          </span>
        </div>
        {/* Badges */}
        <CustomerStatusBadges enrichment={enrichment} className="ml-7" />
        {/* Address */}
        {addr && (
          <div className="ml-7">
            <AddressLink address={addr} className="text-[11px] text-foreground/70 font-medium" iconClassName="h-3 w-3" />
          </div>
        )}
        {/* Phone */}
        {contactPhone && (
          <div className="ml-7 flex items-center gap-1">
            <ClickToCall
              phone={contactPhone}
              contactName={contactName}
              className="text-[11px] text-foreground/70 font-medium"
              iconClassName="h-3 w-3"
            />
            <SmsButton phone={contactPhone} iconClassName="h-2.5 w-2.5" className="h-4 w-4" />
          </div>
        )}
        {/* Email */}
        {c.email && (
          <div className="ml-7 flex items-center gap-1 text-[11px] text-foreground/70">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
        {children}
      </div>
    );
  }

  // Caller variant — full detail card
  if (variant === "caller") {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "Unknown";
    return (
      <Card className={cn("border-primary/20", className)}>
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", avatarSize, getAvatarColor(enrichment))}>
              {initials(c)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary shrink-0" />
                {name}
              </div>
              {c.company && c.first_name && (
                <div className="text-xs text-muted-foreground">{c.company}</div>
              )}
            </div>
          </div>
          <CustomerStatusBadges enrichment={enrichment} showDetail className="ml-[52px]" />
          <div className="space-y-1 ml-[52px]">
            {addr && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                <AddressLink address={addr} className="text-xs hover:text-primary" />
              </div>
            )}
            {c.email && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span>{c.email}</span>
              </div>
            )}
            {(c.phone || c.mobile_phone) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <ClickToCall
                  phone={(c.phone || c.mobile_phone)!}
                  contactName={name}
                  className="text-xs"
                  iconClassName="h-3 w-3"
                />
                <SmsButton phone={(c.phone || c.mobile_phone)!} iconClassName="h-3 w-3" />
              </div>
            )}
          </div>
          {children}
        </div>
      </Card>
    );
  }

  // List variant (default) — compact row
  return (
    <div
      className={cn("flex items-center gap-2.5 cursor-pointer", className)}
      onClick={onClick}
    >
      <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", avatarSize, getAvatarColor(enrichment))}>
        {initials(c)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm">{displayName(c)}</div>
        {c.company && c.first_name && (
          <div className="text-xs text-muted-foreground">{c.company}</div>
        )}
        <CustomerStatusBadges enrichment={enrichment} showDetail={showBadgeDetail} />
      </div>
      {children}
    </div>
  );
}
