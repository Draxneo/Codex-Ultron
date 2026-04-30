import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SmsThreadView } from "@/components/SmsThreadView";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { formatPhone, normalizeLast10, toE164 } from "@/lib/formatters";
import { SMS_COMPOSER_OPEN_EVENT, type SmsComposerOpenDetail } from "@/lib/smsComposerBridge";

export function SmsComposerPopup() {
  const [detail, setDetail] = useState<SmsComposerOpenDetail | null>(null);
  const { conversations, sending, sendSms, markAsRead, setThreadStatus, hasMore, loadMore, loadingMore } = useSmsLogScoped();

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
  const phoneLast10 = normalizeLast10(phone);
  const conversation = useMemo(() => {
    if (!phoneLast10) return null;
    return conversations.find((item) => normalizeLast10(item.phoneNumber) === phoneLast10) || null;
  }, [conversations, phoneLast10]);

  const displayName = detail?.contactName || conversation?.contactName || formatPhone(phone) || phone || "customer";

  const handleSend = async (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => {
    const success = await sendSms(to, body, jobId || detail?.jobId, contactName || detail?.contactName, mediaUrls);
    if (success) setDetail(null);
    return success;
  };

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
            <SmsThreadView
              key={`${phone}-${detail.draft || ""}`}
              conversation={conversation}
              sending={sending}
              onSend={handleSend}
              onMarkRead={markAsRead}
              onStatusChange={setThreadStatus}
              onBack={() => setDetail(null)}
              newMessageMode={!conversation}
              prefillPhone={!conversation ? phone : undefined}
              prefillBody={detail.draft}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
