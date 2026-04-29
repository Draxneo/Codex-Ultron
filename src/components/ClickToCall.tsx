import { Phone } from "lucide-react";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { formatPhone } from "@/lib/formatters";
import { toE164 } from "@/lib/formatters";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
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
  const { startCallSession } = useCopilotPanel();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Universal Twilio normalization — every path gets E.164 (or raw if non-US)
    const e164 = toE164(phone) || phone;

    startCallSession(e164, contactName);
    openPhoneConsole(e164, { contactName, jobId, customerId });
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
