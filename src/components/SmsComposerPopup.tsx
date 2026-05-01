import { lazy, Suspense, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhone, toE164 } from "@/lib/formatters";
import { SMS_COMPOSER_OPEN_EVENT, type SmsComposerOpenDetail } from "@/lib/smsComposerBridge";

const SmsComposerDialogBody = lazy(() =>
  import("@/components/SmsComposerDialogBody").then((module) => ({ default: module.SmsComposerDialogBody }))
);

export function SmsComposerPopup() {
  const [detail, setDetail] = useState<SmsComposerOpenDetail | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<SmsComposerOpenDetail>;
      event.preventDefault();
      setDetail({
        ...customEvent.detail,
        phone: customEvent.detail.phone ? toE164(customEvent.detail.phone) || customEvent.detail.phone : undefined,
      });
    };

    window.addEventListener(SMS_COMPOSER_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(SMS_COMPOSER_OPEN_EVENT, handleOpen);
  }, []);

  const phone = detail?.phone || "";
  const displayName = detail?.contactName || formatPhone(phone) || phone || "customer";

  return (
    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
      <DialogContent className="flex h-[82vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Text {displayName}
          </DialogTitle>
          <DialogDescription>
            {phone ? formatPhone(phone) || phone : "Choose a number before sending."} Send here and stay in the current workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {detail && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading messages...</div>}>
              <SmsComposerDialogBody detail={detail} onClose={() => setDetail(null)} />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
