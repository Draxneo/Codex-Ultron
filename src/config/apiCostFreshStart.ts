/**
 * "Fresh start" epoch for API cost monitoring.
 *
 * After fixing the cost-inflation bug + tightening rates, we want the alert
 * banner to ignore historical inflated rows and count only calls made AFTER
 * this timestamp. Bump this value whenever a major instrumentation fix lands
 * so admins aren't haunted by stale numbers.
 *
 * Stored as ISO string (UTC).
 */
export const API_COST_FRESH_START_AT = "2026-04-17T17:30:00Z";

/** Returns the later of (today midnight local) and the fresh-start epoch. */
export function getApiCostWindowStart(): Date {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const fresh = new Date(API_COST_FRESH_START_AT);
  return fresh > todayStart ? fresh : todayStart;
}
