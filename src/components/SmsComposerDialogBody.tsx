import { useMemo } from "react";
import { SmsThreadView } from "@/components/SmsThreadView";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { normalizeLast10 } from "@/lib/formatters";
import type { SmsComposerOpenDetail } from "@/lib/smsComposerBridge";

export function SmsComposerDialogBody({
  detail,
  onClose,
}: {
  detail: SmsComposerOpenDetail;
  onClose: () => void;
}) {
  const { conversations, sending, sendSms, markAsRead, setThreadStatus, hasMore, loadMore, loadingMore } = useSmsLogScoped();
  const phone = detail.phone || "";
  const phoneLast10 = normalizeLast10(phone);
  const conversation = useMemo(() => {
    if (!phoneLast10) return null;
    return conversations.find((item) => normalizeLast10(item.phoneNumber) === phoneLast10) || null;
  }, [conversations, phoneLast10]);

  const handleSend = async (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => {
    const success = await sendSms(to, body, jobId || detail?.jobId, contactName || detail?.contactName, mediaUrls);
    if (success) onClose();
    return success;
  };

  return (
    <SmsThreadView
      key={`${phone}-${detail.draft || ""}`}
      conversation={conversation}
      sending={sending}
      onSend={handleSend}
      onMarkRead={markAsRead}
      onStatusChange={setThreadStatus}
      onBack={onClose}
      newMessageMode={!conversation}
      prefillPhone={!conversation ? phone : undefined}
      prefillBody={detail.draft}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
