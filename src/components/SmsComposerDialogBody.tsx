import { useMemo } from "react";
import { SmsThreadView } from "@/components/SmsThreadView";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { normalizeLast10 } from "@/lib/formatters";
import { getSmsThreadKey } from "@/hooks/useSmsLog";
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
  const threadTarget = conversation?.threadKey || (phone ? getSmsThreadKey(phone) : "");

  const handleSend = async (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => {
    const success = await sendSms(to, body, jobId || detail?.jobId, contactName || detail?.contactName, mediaUrls, {
      fromNumber: conversation?.toNumber || null,
      businessUnitId: conversation?.businessUnitId || null,
      threadKey: conversation?.threadKey || null,
    });
    if (success) onClose();
    return success;
  };

  const markThreadRead = () => {
    if (threadTarget) markAsRead(threadTarget);
  };

  const setThreadStatusForTarget = (_phone: string, status: Parameters<typeof setThreadStatus>[1]) => {
    if (threadTarget) setThreadStatus(threadTarget, status);
  };

  return (
    <SmsThreadView
      key={`${phone}-${detail.draft || ""}`}
      conversation={conversation}
      sending={sending}
      onSend={handleSend}
      onMarkRead={markThreadRead}
      onStatusChange={setThreadStatusForTarget}
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
