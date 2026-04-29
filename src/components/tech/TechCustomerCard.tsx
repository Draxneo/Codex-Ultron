/**
 * TechCustomerCard.tsx - Customer card for the tech job detail.
 *
 * Layout:
 *   [ Street View thumbnail ]
 *   Customer name
 *   📍 Address
 *   [ Call ] [ Text ] [ Dispatch ] [ Navigate ]   ← large tap targets
 *   Customer History (n) -> /tech/customers/:id
 *
 * "Dispatch" sends an SMS to the office dispatch line (210-600-5091)
 * via our existing /sms compose route.
 */

import { Card } from "@/components/ui/card";
import { Phone, MessageSquare, Radio, ChevronRight, Building2, Navigation } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { StreetViewThumbnail } from "./StreetViewThumbnail";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useCapacitor } from "@/hooks/useCapacitor";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";

const DISPATCH_LINE = "+12106005091";

interface TechCustomerCardProps {
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string | null;
  jobCount?: number;
  hcpCustomerId?: string | null;
  jobId?: string;
  /** Render without outer Card chrome (used inside TechCollapsibleCard) */
  bare?: boolean;
}

export function TechCustomerCard({
  customerId,
  customerName,
  customerPhone,
  address,
  jobCount,
  hcpCustomerId,
  jobId,
  bare = false,
}: TechCustomerCardProps) {
  const navigate = useNavigate();
  const softphone = useSoftphoneContext();
  const { isNative } = useCapacitor();

  const handleSms = () => {
    if (!customerPhone) return;
    navigate(`/sms?phone=${encodeURIComponent(customerPhone)}`);
  };

  const handleDispatch = () => {
    const draft = [
      "Tech update",
      customerName || null,
      address || null,
      jobId ? `job ${jobId.slice(0, 8)}` : null,
    ].filter(Boolean).join(" - ");
    const draftParam = encodeURIComponent(`${draft}: `);
    navigate(`/sms?phone=${encodeURIComponent(DISPATCH_LINE)}&draft=${draftParam}`);
  };

  const handleCall = () => {
    if (!customerPhone) return;
    if (softphone.status === "ready" || softphone.status === "on-call" || softphone.status === "ringing" || softphone.status === "connecting") {
      softphone.dial?.(customerPhone, customerName || undefined, jobId);
      return;
    }
    openPhoneConsole(customerPhone);
  };

  const handleNavigate = () => {
    if (!address) return;
    const q = encodeURIComponent(address);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.open(
      isIOS ? `maps://?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`,
      "_blank",
    );
  };

  const inner = (
    <>
      <StreetViewThumbnail address={address} className="rounded-none" />

      <div className="p-4 space-y-3">
        {/* Name */}
        <div>
          <p className="text-base font-semibold text-foreground truncate">{customerName || "Unknown"}</p>
          {hcpCustomerId && !isNative && (
            <a
              href={`https://pro.housecallpro.com/app/customers/${hcpCustomerId}`}
              target="_blank"
              rel="noopener"
              className="text-[11px] text-primary hover:underline hidden md:inline"
            >
              HCP source
            </a>
          )}
        </div>

        {/* Address */}
        {address && (
          <p className="text-sm text-foreground leading-snug">{address}</p>
        )}

        {/* Big action grid - 4 large tap targets */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          <ActionButton onClick={handleCall} disabled={!customerPhone} icon={Phone} label="Call" ariaLabel="Call customer" tone="primary" />
          <ActionButton onClick={handleSms} disabled={!customerPhone} icon={MessageSquare} label="Text" ariaLabel="Text customer" tone="primary" />
          <ActionButton onClick={handleDispatch} icon={Radio} label="Dispatch" ariaLabel="Contact dispatch" tone="amber" />
          <ActionButton onClick={handleNavigate} disabled={!address} icon={Navigation} label="Navigate" tone="emerald" />
        </div>

        {/* Customer History link */}
        {customerId && (
          <Link
            to={`/tech/customers/${customerId}`}
            className="flex items-center gap-2 -mx-2 px-2 h-10 border-t border-border pt-2 mt-2 active:bg-muted/50 rounded"
          >
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Customer History</span>
            {typeof jobCount === "number" && (
              <span className="text-xs text-muted-foreground">({jobCount})</span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </Link>
        )}
      </div>
    </>
  );

  if (bare) return inner;
  return <Card className="overflow-hidden">{inner}</Card>;
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  label,
  ariaLabel,
  tone = "primary",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  ariaLabel?: string;
  tone?: "primary" | "amber" | "emerald";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary active:bg-primary/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 active:bg-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 active:bg-emerald-500/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || label}
      className={`flex flex-col items-center justify-center gap-1 h-16 rounded-xl disabled:opacity-30 ${tones[tone]}`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}
