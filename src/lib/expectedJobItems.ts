export type ExpectedItemStatus = "done" | "needs_attention" | "waiting" | "upcoming" | "skipped";

export type ExpectedJobItem = {
  key: string;
  label: string;
  owner: "office" | "tech" | "customer" | "system";
  status: ExpectedItemStatus;
  reason: string;
};

type InvoiceLike = {
  status?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  total?: number | null;
};

type PartsOrderLike = {
  status?: string | null;
  ordered_at?: string | null;
  picked_up_at?: string | null;
};

type JobCartLike = {
  status?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_timing?: string | null;
  source_presentation_id?: string | null;
  first_viewed_at?: string | null;
  total?: number | null;
  item_count?: number | null;
};

function normalized(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isCompleteStatus(status?: string | null) {
  return ["done", "completed", "complete", "closed"].includes(normalized(status));
}

function isFieldStarted(job: any, status?: string | null) {
  return Boolean(
    job?.on_site_at ||
    job?.started_at ||
    job?.completed_at ||
    ["in_progress", "started", "done", "completed", "complete", "closed"].includes(normalized(status))
  );
}

function hasSentInvoice(job: any, invoices: InvoiceLike[]) {
  return Boolean(
    job?.invoice_sent_at ||
    invoices.some((invoice) => ["sent", "paid"].includes(normalized(invoice.status)) || invoice.sent_at || invoice.paid_at)
  );
}

function hasPaidInvoice(job: any, invoices: InvoiceLike[]) {
  return Boolean(
    job?.payment_collected_at ||
    invoices.some((invoice) => normalized(invoice.status) === "paid" || invoice.paid_at)
  );
}

function hasPaidCart(cart?: JobCartLike | null) {
  return Boolean(cart?.paid_at || normalized(cart?.status) === "paid");
}

function hasEquipmentOrdered(job: any, partsOrders: PartsOrderLike[]) {
  return Boolean(
    job?.equipment_ordered_at ||
    partsOrders.some((order) => ["ordered", "ready_for_pickup", "picked_up", "installed"].includes(normalized(order.status)) || order.ordered_at)
  );
}

function item(
  key: string,
  label: string,
  owner: ExpectedJobItem["owner"],
  done: boolean,
  reasonDone: string,
  reasonOpen: string,
  status: ExpectedItemStatus = "needs_attention"
): ExpectedJobItem {
  return {
    key,
    label,
    owner,
    status: done ? "done" : status,
    reason: done ? reasonDone : reasonOpen,
  };
}

export function getExpectedJobItems(
  job: any,
  invoices: InvoiceLike[] = [],
  partsOrders: PartsOrderLike[] = [],
  cart?: JobCartLike | null
): ExpectedJobItem[] {
  const type = normalized(job?.job_type || "service");
  const status = normalized(job?.status);
  const fieldDone = isCompleteStatus(status) || Boolean(job?.completed_at || job?.completion_form_sent_at);
  const paymentMethod = normalized(job?.payment_method);
  const cartStatus = normalized(cart?.status);
  const cartPaymentTiming = normalized(cart?.payment_timing);
  const cartPaymentMethod = normalized(cart?.payment_method);
  const cartHasItems = Number(cart?.item_count || 0) > 0 || Number(cart?.total || 0) > 0;
  const cartIsInPlay = Boolean(cartHasItems || cart?.source_presentation_id || ["sent", "approved", "paid"].includes(cartStatus));
  const cartSent = Boolean(cart?.sent_at || cart?.first_viewed_at || ["sent", "approved", "paid"].includes(cartStatus));
  const cartApproved = Boolean(cart?.approved_at || ["approved", "paid"].includes(cartStatus));
  const cartPaid = hasPaidCart(cart);
  const cartFinancing = cartPaymentTiming === "financing" || cartPaymentMethod === "financing";
  const cartPayAfter = cartPaymentTiming === "pay_after_completion" || cartPaymentMethod === "pay_after_completion";

  if (type === "estimate") {
    return [
      item("estimate_scheduled", "Schedule estimate", "office", Boolean(job?.scheduled_date), "Estimate is scheduled.", "Needs a scheduled date."),
      item("estimator_assigned", "Assign estimator", "office", Boolean(job?.assigned_to), "Estimator is assigned.", "Needs an assigned estimator."),
      item("site_visit", "Complete visit and notes", "tech", fieldDone, "Visit is complete.", "Waiting on visit notes/photos.", "waiting"),
      item("quote_built", "Build quote", "office", Boolean(job?.quote_generated_at), "Quote has been generated.", "Needs quote/pricing built."),
      item("presentation_sent", "Send presentation", "office", Boolean(job?.presentation_sent_at), "Presentation was sent.", "Needs quote presentation sent."),
      item("customer_decision", "Customer decision", "customer", Boolean(job?.customer_approved_at || job?.estimate_id || status === "won" || status === "lost"), "Customer decision recorded.", "Waiting on customer decision.", "waiting"),
    ];
  }

  const common: ExpectedJobItem[] = [
    item("scheduled", "Schedule appointment", "office", Boolean(job?.scheduled_date), "Appointment is scheduled.", "Needs a scheduled date."),
    item("assigned", "Assign technician", "office", Boolean(job?.assigned_to), "Technician is assigned.", "Needs an assigned technician."),
    item("confirmation", "Send appointment reminder", "system", Boolean(job?.confirmation_sent_at), "Reminder was sent.", "Reminder has not been sent.", "upcoming"),
    item("dispatch", "Dispatch / on my way", "tech", Boolean(job?.dispatch_sent_at || job?.on_my_way_sent_at), "Dispatch/OMW was sent.", "Waiting on dispatch or on-my-way.", "waiting"),
    item("on_site", "Mark on site", "tech", isFieldStarted(job, status), "Job reached on-site/in-progress.", "Tech has not marked on-site yet.", "waiting"),
    item("completion", "Complete work/checklist", "tech", fieldDone, "Completion is recorded.", "Needs completion form or done status.", "waiting"),
    ...(cartIsInPlay ? [
      item("cart_sent", "Send customer options", "office", cartSent, "Customer options were sent.", "Options are drafted but not sent."),
      item("cart_approved", "Customer approves option", "customer", cartApproved, "Customer approved an option.", cartSent ? "Waiting on customer approval." : "Send options before approval.", cartSent ? "waiting" : "upcoming"),
      ...(cartFinancing ? [
        item("financing_pending", "Financing selected", "customer", cartPaid, "Financing/payment is complete.", "Customer selected financing. Track approval before closing payment.", "waiting"),
      ] : []),
      ...(cartPayAfter ? [
        item("pay_after_work", "Payment due after work", "customer", cartPaid, "Pay-after-work balance is collected.", fieldDone ? "Work is complete. Collect payment." : "Customer will pay after completion.", fieldDone ? "needs_attention" : "waiting"),
      ] : []),
    ] : []),
    item("invoice", "Create/send invoice", "office", hasSentInvoice(job, invoices) || cartSent, cartSent ? "Customer cart/payment link is sent." : "Invoice is sent.", "Needs invoice or customer cart sent."),
    item("payment", "Collect payment", "customer", hasPaidInvoice(job, invoices) || cartPaid, "Payment is collected.", cartApproved ? "Approved scope is unpaid." : "Payment has not been collected.", cartApproved ? "needs_attention" : "waiting"),
    item("review", "Request review", "system", Boolean(job?.review_request_sent_at), "Review request was sent.", "Review request not sent yet.", "upcoming"),
    item("follow_up", "Quality follow-up", "office", Boolean(job?.follow_up_completed_at), "Follow-up is complete.", "Follow-up still open.", "upcoming"),
  ];

  if (type === "install") {
    const depositSkipped = paymentMethod === "financed";
    const inspectionSkipped = !job?.permit_required;

    return [
      item("equipment_ordered", "Order equipment", "office", hasEquipmentOrdered(job, partsOrders), "Equipment/parts are ordered.", "Needs equipment ordered."),
      common[0],
      common[1],
      depositSkipped
        ? { key: "deposit", label: "Collect deposit", owner: "customer", status: "skipped", reason: "Skipped because payment method is financed." }
        : item("deposit", "Collect deposit", "customer", Boolean(job?.deposit_paid_at), "Deposit is paid.", "Deposit has not been collected."),
      item("preinstall", "Send pre-install info", "system", Boolean(job?.preinstall_sent_at), "Pre-install info was sent.", "Pre-install info not sent yet.", "upcoming"),
      ...common.slice(2, 8),
      item("warranty", "Register warranty", "office", Boolean(job?.warranty_registered_at), "Warranty is registered.", "Warranty is not registered."),
      inspectionSkipped
        ? { key: "inspection", label: "Pass inspection", owner: "office", status: "skipped", reason: "Skipped because permit is not required." }
        : item("inspection", "Pass inspection", "office", Boolean(job?.inspection_passed_at), "Inspection is passed.", "Inspection still open."),
      item("rebate", "Submit rebate", "office", !job?.rebate_eligible || Boolean(job?.rebate_submitted_at), job?.rebate_eligible ? "Rebate is submitted." : "Skipped because rebate is not marked eligible.", "Rebate is eligible but not submitted.", job?.rebate_eligible ? "needs_attention" : "skipped"),
      ...common.slice(8),
    ];
  }

  if (type === "maintenance" || job?.is_service_agreement) {
    return [
      ...common.slice(0, 6),
      item("maintenance_report", "Send maintenance report", "office", Boolean(job?.maint_report_sent_at), "Maintenance report was sent.", "Maintenance report not sent."),
      item("next_visit", "Schedule next visit", "office", Boolean(job?.next_visit_scheduled_at), "Next visit is scheduled.", "Next visit is not scheduled.", "upcoming"),
      ...common.slice(6),
    ];
  }

  return common;
}

export function getExpectedJobSummary(items: ExpectedJobItem[]) {
  const active = items.filter((item) => item.status !== "skipped");
  const done = active.filter((item) => item.status === "done").length;
  const needsAttention = active.filter((item) => item.status === "needs_attention").length;

  return {
    done,
    total: active.length,
    needsAttention,
    percent: active.length ? Math.round((done / active.length) * 100) : 100,
  };
}
