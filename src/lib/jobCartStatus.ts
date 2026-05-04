import type { JobCart } from "@/hooks/useJobCart";

export type CartStatusTone = "neutral" | "warning" | "info" | "success" | "danger";

export type JobCartStatusInfo = {
  label: string;
  detail: string;
  tone: CartStatusTone;
  needsPayment: boolean;
  canSendPaymentLink: boolean;
  canCollectNow: boolean;
  isApproved: boolean;
  isPaid: boolean;
  isFinancing: boolean;
  isPayAfterCompletion: boolean;
  hasBeenViewed: boolean;
};

export type JobCartPermissions = {
  canEditItems: boolean;
  canApplyPromo: boolean;
  canSendForApproval: boolean;
  canSendPaymentLink: boolean;
  canOpenPayment: boolean;
  canCopyLink: boolean;
  lockedReason: string | null;
};

function normalized(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function getJobCartStatus(cart?: JobCart | null, itemCount = 0): JobCartStatusInfo {
  if (!cart) {
    return {
      label: "No estimate",
      detail: "No customer Estimate has been started.",
      tone: "neutral",
      needsPayment: false,
      canSendPaymentLink: false,
      canCollectNow: false,
      isApproved: false,
      isPaid: false,
      isFinancing: false,
      isPayAfterCompletion: false,
      hasBeenViewed: false,
    };
  }

  const status = normalized(cart.status);
  const paymentMethod = normalized(cart.payment_method);
  const paymentTiming = normalized(cart.payment_timing);
  const hasBeenViewed = Boolean(cart.first_viewed_at || cart.last_viewed_at || Number(cart.view_count || 0) > 0);
  const isPaid = status === "paid" || Boolean(cart.paid_at);
  const isApproved = isPaid || status === "approved" || Boolean(cart.approved_at);
  const isFinancing = paymentTiming === "financing" || paymentMethod === "financing";
  const isPayAfterCompletion = paymentTiming === "pay_after_completion" || paymentMethod === "pay_after_completion";

  if (isPaid) {
    return {
      label: "Paid",
      detail: "Customer payment is collected.",
      tone: "success",
      needsPayment: false,
      canSendPaymentLink: false,
      canCollectNow: false,
      isApproved,
      isPaid,
      isFinancing,
      isPayAfterCompletion,
      hasBeenViewed,
    };
  }

  if (status === "declined") {
    return {
      label: "Declined",
      detail: "Customer declined this option set. Revise and resend when ready.",
      tone: "danger",
      needsPayment: false,
      canSendPaymentLink: false,
      canCollectNow: false,
      isApproved: false,
      isPaid,
      isFinancing,
      isPayAfterCompletion,
      hasBeenViewed,
    };
  }

  if (isApproved && isFinancing) {
    return {
      label: "Financing selected",
      detail: "Customer approved the scope and chose financing.",
      tone: "info",
      needsPayment: true,
      canSendPaymentLink: false,
      canCollectNow: false,
      isApproved,
      isPaid,
      isFinancing,
      isPayAfterCompletion,
      hasBeenViewed,
    };
  }

  if (isApproved && isPayAfterCompletion) {
    return {
      label: "Approved, pay after work",
      detail: "Customer approved the scope. Payment is due after completion.",
      tone: "warning",
      needsPayment: true,
      canSendPaymentLink: true,
      canCollectNow: true,
      isApproved,
      isPaid,
      isFinancing,
      isPayAfterCompletion,
      hasBeenViewed,
    };
  }

  if (isApproved) {
    return {
      label: "Approved, unpaid",
      detail: "Customer approved the Estimate. Payment still needs to be collected.",
      tone: "warning",
      needsPayment: true,
      canSendPaymentLink: true,
      canCollectNow: true,
      isApproved,
      isPaid,
      isFinancing,
      isPayAfterCompletion,
      hasBeenViewed,
    };
  }

  if (status === "sent") {
    return {
      label: hasBeenViewed ? "Viewed" : "Sent",
      detail: hasBeenViewed ? "Customer opened the Estimate link." : "Estimate is waiting for the customer to open and approve.",
      tone: hasBeenViewed ? "info" : "neutral",
      needsPayment: false,
      canSendPaymentLink: itemCount > 0,
      canCollectNow: false,
      isApproved,
      isPaid,
      isFinancing,
      isPayAfterCompletion,
      hasBeenViewed,
    };
  }

  return {
    label: itemCount > 0 ? "Draft" : "Empty draft",
    detail: itemCount > 0 ? "Ready to send for customer approval." : "Add repair or equipment options before sending.",
    tone: itemCount > 0 ? "warning" : "neutral",
    needsPayment: false,
    canSendPaymentLink: itemCount > 0,
    canCollectNow: false,
    isApproved,
    isPaid,
    isFinancing,
    isPayAfterCompletion,
    hasBeenViewed,
  };
}

export function getJobCartPermissions(cart?: JobCart | null, itemCount = 0): JobCartPermissions {
  const statusInfo = getJobCartStatus(cart, itemCount);
  const status = normalized(cart?.status);
  const hasItems = itemCount > 0;
  const isCanceled = status === "canceled";
  const isDeclined = status === "declined";
  const lockedReason = statusInfo.isPaid
    ? "This estimate is paid and locked."
    : statusInfo.isApproved
      ? "This estimate is approved and locked. Create a new Estimate for changes."
      : isCanceled
        ? "This estimate is canceled."
        : null;

  const canEditItems = Boolean(cart && !statusInfo.isPaid && !statusInfo.isApproved && !isCanceled);

  return {
    canEditItems,
    canApplyPromo: canEditItems,
    canSendForApproval: Boolean(cart && hasItems && !statusInfo.isPaid && !statusInfo.isApproved && !isCanceled),
    canSendPaymentLink: statusInfo.canSendPaymentLink,
    canOpenPayment: Boolean(cart && (statusInfo.canCollectNow || statusInfo.isApproved || status === "sent")),
    canCopyLink: Boolean(cart && !isCanceled && !isDeclined),
    lockedReason,
  };
}

export function cartToneClasses(tone: CartStatusTone) {
  switch (tone) {
    case "success":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "warning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "info":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "danger":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
