/**
 * Single source of truth for all status → color mappings across the app.
 * Uses semantic design tokens from index.css / tailwind.config.ts.
 */

/* ─── Job statuses (used by JobStatusBadge) ─── */
export const JOB_STATUS_COLORS: Record<string, { className: string; dot: string; label: string }> = {
  new:          { className: "bg-sky/15 text-sky border-sky/30",                         dot: "bg-sky",                label: "New" },
  scheduled:    { className: "bg-primary/15 text-primary border-primary/30",             dot: "bg-primary",            label: "Scheduled" },
  in_progress:  { className: "bg-warm/15 text-warm border-warm/30",                     dot: "bg-warm",               label: "In Progress" },
  done:         { className: "bg-complete/15 text-complete border-complete/30",           dot: "bg-complete",           label: "Done" },
  invoiced:     { className: "bg-complete/20 text-complete border-complete/30",           dot: "bg-complete",           label: "Invoiced" },
  on_hold:      { className: "bg-accent/15 text-accent border-accent/30",               dot: "bg-accent",             label: "On Hold" },
  canceled:     { className: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive",        label: "Canceled" },
  completed:    { className: "bg-complete/15 text-complete border-complete/30",           dot: "bg-complete",           label: "Completed" },
};

/* ─── Estimate statuses ─── */
export const ESTIMATE_STATUS_COLORS: Record<string, { className: string; dot: string; label: string }> = {
  new:        { className: "bg-sky/15 text-sky border-sky/30",                         dot: "bg-sky",         label: "New" },
  scheduled:  { className: "bg-primary/15 text-primary border-primary/30",             dot: "bg-primary",     label: "Scheduled" },
  won:        { className: "bg-complete/15 text-complete border-complete/30",           dot: "bg-complete",    label: "Won" },
  lost:       { className: "bg-muted text-muted-foreground border-border",             dot: "bg-muted-foreground", label: "Lost" },
  canceled:   { className: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive", label: "Canceled" },
};

/* ─── Invoice statuses ─── */
export const INVOICE_STATUS_COLORS: Record<string, { className: string; dot: string; label: string }> = {
  draft: { className: "bg-muted text-muted-foreground border-border",                   dot: "bg-muted-foreground", label: "Draft" },
  sent:  { className: "bg-primary/15 text-primary border-primary/30",                   dot: "bg-primary",          label: "Sent" },
  paid:  { className: "bg-complete/15 text-complete border-complete/30",                 dot: "bg-complete",         label: "Paid" },
  void:  { className: "bg-destructive/15 text-destructive border-destructive/30",       dot: "bg-destructive",      label: "Void" },
};

/* ─── Stripe / payment event statuses ─── */
export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-complete/15 text-complete border-complete/30",
  failed:    "bg-destructive/15 text-destructive border-destructive/30",
  refunded:  "bg-primary/15 text-primary border-primary/30",
  disputed:  "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

/* ─── Portal statuses (customer-facing preview) ─── */
export const PORTAL_STATUS_COLORS: Record<string, string> = {
  completed:   "bg-complete/15 text-complete border-complete/30",
  scheduled:   "bg-sky/15 text-sky border-sky/30",
  in_progress: "bg-warm/15 text-warm border-warm/30",
  paid:        "bg-complete/15 text-complete border-complete/30",
  sent:        "bg-warm/15 text-warm border-warm/30",
};

/* ─── Paysheet statuses (uses Badge variants, not className) ─── */
export function getPaysheetBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "paid") return "default";
  if (status === "approved") return "secondary";
  if (status === "held") return "destructive";
  return "outline";
}

/* ─── Unified lookup ─── */
export function getStatusConfig(status: string, entityType: "job" | "estimate" | "invoice" = "job") {
  const map = entityType === "estimate" ? ESTIMATE_STATUS_COLORS
    : entityType === "invoice" ? INVOICE_STATUS_COLORS
    : JOB_STATUS_COLORS;

  const fallbackLabel = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return map[status] || { className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground", label: fallbackLabel };
}
