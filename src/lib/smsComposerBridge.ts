export const SMS_COMPOSER_OPEN_EVENT = "ultraoffice:open-sms-composer";

export type SmsComposerOpenDetail = {
  phone?: string;
  draft?: string;
  contactName?: string;
  jobId?: string;
  customerId?: string;
  /** Exact conversation identity for multi-company SMS threads. */
  threadKey?: string | null;
  /** Explicit sending company line, e.g. Carnes or FIX. */
  fromNumber?: string | null;
  /** Explicit company/business unit for the thread. */
  businessUnitId?: string | null;
};

export function buildSmsPageUrl(phone?: string | null, draft?: string | null) {
  if (!phone) return "/sms";
  const params = new URLSearchParams();
  params.set("phone", phone);
  if (draft) params.set("draft", draft);
  return `/sms?${params.toString()}`;
}

export function openSmsComposer(phone?: string | null, context?: Omit<SmsComposerOpenDetail, "phone">) {
  const detail: SmsComposerOpenDetail = {
    phone: phone || undefined,
    draft: context?.draft,
    contactName: context?.contactName,
    jobId: context?.jobId,
    customerId: context?.customerId,
    threadKey: context?.threadKey,
    fromNumber: context?.fromNumber,
    businessUnitId: context?.businessUnitId,
  };

  const openEvent = new CustomEvent<SmsComposerOpenDetail>(SMS_COMPOSER_OPEN_EVENT, {
    cancelable: true,
    detail,
  });
  const shouldFallbackToPage = window.dispatchEvent(openEvent);
  if (!shouldFallbackToPage) return;

  window.location.assign(buildSmsPageUrl(detail.phone, detail.draft));
}
