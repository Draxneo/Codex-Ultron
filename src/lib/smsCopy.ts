type JobSmsCopyInput = {
  customerName?: string | null;
  techName?: string | null;
  etaMinutes?: number | null;
  companyName?: string | null;
  reviewLink?: string | null;
};

export function customerFirstName(name?: string | null) {
  return name?.trim()?.split(/\s+/)[0] || "there";
}

export function buildOnMyWaySms({
  customerName,
  techName,
  etaMinutes,
  companyName = "our team",
}: JobSmsCopyInput) {
  const first = customerFirstName(customerName);
  const tech = techName || "Your technician";
  const etaText = etaMinutes ? ` ETA is ${etaMinutes} minutes.` : "";
  return `Hi ${first}, ${tech} with ${companyName} is on the way.${etaText} We appreciate you letting our family take care of yours today. Reply here if we need a gate code, pet note, or anything else before arrival.`;
}

export function buildJobCompleteSms({
  customerName,
  companyName = "our team",
}: JobSmsCopyInput) {
  const first = customerFirstName(customerName);
  return `Hi ${first}, thank you for letting our family serve yours today. Your visit is marked complete. We appreciate you choosing ${companyName}, and we are always just a text away if you need us again.`;
}

export function buildReviewRequestSms({
  customerName,
  companyName = "our team",
  reviewLink,
}: JobSmsCopyInput) {
  const first = customerFirstName(customerName);
  return reviewLink
    ? `Hi ${first}, thank you for letting our family take care of yours. If we earned it, would you mind leaving us a quick review? ${reviewLink}`
    : `Hi ${first}, thank you for letting our family take care of yours. If we did a great job, would you reply here and let us know?`;
}
