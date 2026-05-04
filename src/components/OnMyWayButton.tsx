import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Navigation, Check, Loader2 } from "lucide-react";
import { useSendOnMyWay } from "@/hooks/useSendOnMyWay";

interface OnMyWayButtonProps {
  jobId: string;
  customerPhone?: string | null;
  customerName?: string | null;
  jobAddress?: string | null;
  employeeName?: string | null;
  employeeAddress?: string | null;
  employeeId?: string | null;
  alreadySent?: string | null;
  className?: string;
}

export function OnMyWayButton({
  jobId,
  customerPhone,
  customerName,
  jobAddress,
  employeeName,
  employeeId,
  alreadySent,
  className,
}: OnMyWayButtonProps) {
  const { send, sending } = useSendOnMyWay();
  const [sent, setSent] = useState(Boolean(alreadySent));

  useEffect(() => {
    setSent(Boolean(alreadySent));
  }, [alreadySent]);

  const handleSend = async () => {
    const ok = await send({
      jobId,
      customerPhone,
      customerName,
      jobAddress,
      employeeName,
      employeeId,
    });
    if (ok) setSent(true);
  };

  return (
    <Button
      variant={sent ? "secondary" : "default"}
      size="sm"
      className={className}
      disabled={sending || sent}
      onClick={handleSend}
    >
      {sending ? (
        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Sending...</>
      ) : sent ? (
        <><Check className="h-3.5 w-3.5 mr-1" /> ETA Sent to Customer</>
      ) : (
        <><Navigation className="h-3.5 w-3.5 mr-1" /> Text ETA to Customer</>
      )}
    </Button>
  );
}
