import { Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";
import { formatPhone } from "@/lib/formatters";
import { toE164 } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ClickToCallProps {
  phone: string;
  contactName?: string;
  /** Job or estimate ID — when provided, the call_log row is linked to it deterministically. */
  jobId?: string;
  /** Customer ID — when provided, the call_log row is linked to the customer deterministically.
   * Use this when calling from a customer detail page (where there's no job context). */
  customerId?: string;
  className?: string;
  iconClassName?: string;
  children?: ReactNode;
  showIcon?: boolean;
}

/**
 * Renders a phone number that dials via the softphone on click.
 * When telephony handoff is ON, every platform launches Ultraphone instead of
 * the in-app softphone.
 *
 * IMPORTANT — Deterministic context:
 * When called from a job, estimate, or customer page, ALWAYS pass jobId or customerId.
 * This guarantees the call_log row, AI summary, HCP note, and to-do extraction all
 * land on the right record — no phone-based guessing, no AI hallucination of names
 * from voicemail greetings.
 */
export function ClickToCall({
  phone,
  contactName,
  jobId,
  customerId,
  className,
  iconClassName = "h-3 w-3",
  children,
  showIcon = true,
}: ClickToCallProps) {
  const softphone = useSoftphoneContext();
  const { startCallSession } = useCopilotPanel();
  const navigate = useNavigate();
  const telephony = useTelephonyMode();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Universal Twilio normalization — every path gets E.164 (or raw if non-US)
    const e164 = toE164(phone) || phone;

    // ALWAYS use the in-app popup dialer (SoftphoneStrip), even when telephony
    // handoff is enabled. The user explicitly wants click-to-call to open the
    // universal popup instead of launching Ultraphone.
    softphone.setDialNumber(e164);
    softphone.setPendingJobId(jobId || null);
    softphone.setPendingCustomerId?.(customerId || null);

    startCallSession(e164, contactName);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer",
        className
      )}
      title={`Call ${contactName || phone}`}
    >
      {showIcon && <Phone className={cn("shrink-0", iconClassName)} />}
      {children ?? (formatPhone(phone) || phone)}
    </button>
  );
}
