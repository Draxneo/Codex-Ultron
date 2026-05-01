// Current-app lifecycle cutoffs.
//
// We keep historical Housecall Pro import data for reference, but current action
// boards should only count work created after these dates unless a page is
// explicitly showing history.
export const APP_ACTION_GO_LIVE_DATE = "2026-03-24";
export const APP_ACTION_GO_LIVE_ISO = "2026-03-24T00:00:00.000Z";
export const NOW_HQ_LAUNCH_CUTOFF = "2026-04-30T00:00:00.000Z";

// One source of truth for statuses that should not appear on current-action
// dashboards. History pages can still show them, but NOW/Dispatch/Admin counts
// should treat all of these as no longer needing office attention.
export const CLOSED_WORK_STATUSES = [
  "archived",
  "canceled",
  "cancelled",
  "closed",
  "complete",
  "completed",
  "done",
  "invoiced",
  "paid",
] as const;

export const CLOSED_WORK_STATUS_FILTER = '("archived","canceled","cancelled","closed","complete","completed","done","invoiced","paid")';

export const CLOSED_ESTIMATE_STATUSES = [
  "canceled",
  "cancelled",
  "closed",
  "complete",
  "completed",
  "converted",
  "done",
  "legacy_complete",
  "lost",
  "rejected",
  "won",
] as const;

export const CLOSED_ESTIMATE_STATUS_FILTER = '("canceled","cancelled","closed","complete","completed","converted","done","legacy_complete","lost","rejected","won")';

export const CLOSED_CART_STATUSES = [
  "canceled",
  "cancelled",
  "declined",
  "paid",
] as const;

export const CLOSED_CART_STATUS_FILTER = '("canceled","cancelled","declined","paid")';
