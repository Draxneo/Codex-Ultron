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
    const exactThread = detail.threadKey
      ? conversations.find((item) => item.threadKey === detail.threadKey)
      : null;
    if (exactThread) return exactThread;

    const fromLast10 = normalizeLast10(detail.fromNumber || "");
    const exactLine = conversations.find((item) => {
      if (normalizeLast10(item.phoneNumber) !== phoneLast10) return false;
      if (detail.businessUnitId && item.businessUnitId === detail.businessUnitId) return true;
      if (fromLast10 && normalizeLast10(item.toNumber || "") === fromLast10) return true;
      return false;
    });
    if (exactLine) return exactLine;

    return conversations.find((item) => normalizeLast10(item.phoneNumber) === phoneLast10) || null;
  }, [conversations, detail.businessUnitId, detail.fromNumber, detail.threadKey, phoneLast10]);
  const threadTarget = conversation?.threadKey || detail.threadKey || (phone ? getSmsThreadKey(phone, detail.fromNumber, detail.businessUnitId) : "");

  const handleSend = async (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => {
    const success = await sendSms(to, body, jobId || detail?.jobId, contactName || detail?.contactName, mediaUrls, {
      fromNumber: conversation?.toNumber || detail.fromNumber || null,
      businessUnitId: conversation?.businessUnitId || detail.businessUnitId || null,
      threadKey: conversation?.threadKey || detail.threadKey || null,
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
