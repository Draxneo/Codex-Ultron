import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toE164 } from "@/lib/formatters";
import { openSmsComposer } from "@/lib/smsComposerBridge";

interface SmsButtonProps {
  phone: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Small SMS icon button that opens the shared SMS composer.
 * Always normalizes the number to Twilio E.164 before navigating so
 * downstream lookups & sends use the canonical format.
 *
 */
export function SmsButton({ phone, className, iconClassName = "h-3.5 w-3.5" }: SmsButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const normalized = toE164(phone) || phone;
        openSmsComposer(normalized);
      }}
      className={cn(
        "inline-flex items-center justify-center h-5 w-5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors cursor-pointer",
        className
      )}
      title="Send SMS"
    >
      <MessageSquare className={cn("shrink-0", iconClassName)} />
    </button>
  );
}
