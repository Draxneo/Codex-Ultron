/**
 * Per-service daily limits for cost monitoring & alerting.
 *
 * `dailyCostUsd` — soft alert at 80%, RED WARNING at 100%
 * `dailyCalls`   — call-volume sanity ceiling (independent of cost)
 *
 * Limits are based on actual healthy usage patterns (3-4 jobs/day, ~20 staff).
 * Anything above these means a runaway loop, broken cache, or accidental UI re-render storm.
 */

export interface ApiServiceLimit {
  service: string;
  label: string;
  dailyCostUsd: number;     // hard alert threshold (cost)
  dailyCalls: number;       // hard alert threshold (volume)
  expectedDailyCalls: string; // human-readable "what's normal"
  costPerCall?: string;       // human-readable unit cost
  notes?: string;
  /** Expected calls per active job on the board today. Used to compute a dynamic "should be ≤ N" ceiling. */
  expectedCallsPerJob?: number;
  /** Baseline calls regardless of job count (e.g. one ETA per tech, scheduled crons). */
  baselineCalls?: number;
}

export const API_COST_LIMITS: ApiServiceLimit[] = [
  {
    service: "google_maps",
    label: "Google Maps",
    dailyCostUsd: 2.0,
    dailyCalls: 200,
    expectedDailyCalls: "~20–80 (Navigate presses + 1 ETA per tech per day)",
    costPerCall: "$0.005 (directions) / $0.005 (geocode)",
    notes: "Only Navigate button + today's ETA should hit this. Triggers + dispatcher auto-fetch are OFF.",
    expectedCallsPerJob: 2,    // ~1 route calc + maybe 1 navigate press
    baselineCalls: 5,           // 1 ETA per active tech
  },
  {
    service: "lovable_ai",
    label: "JARVIS AI (JARVIS)",
    dailyCostUsd: 25.0,
    dailyCalls: 500,
    expectedDailyCalls: "~50–300 (chat + classification + extraction)",
    costPerCall: "Varies by model — gpt-5-mini ~$0.001, gpt-5 ~$0.05",
    notes: "ai-task-agent is the orchestrator. >$25/day means runaway tool loops.",
    expectedCallsPerJob: 8,
    baselineCalls: 30,
  },
  {
    service: "twilio_sms",
    label: "Twilio SMS",
    dailyCostUsd: 5.0,
    dailyCalls: 300,
    expectedDailyCalls: "~30–150 (customer + tech alerts)",
    costPerCall: "$0.0083 per segment",
    expectedCallsPerJob: 6,    // confirm, OMW, follow-up, tech-assigned, etc.
    baselineCalls: 60,         // 2-way tech/customer texts, OTPs, missed-call replies — happen all day regardless of jobs
  },
  {
    service: "twilio_voice",
    label: "Twilio Voice",
    dailyCostUsd: 5.0,
    dailyCalls: 200,
    expectedDailyCalls: "~10–80 inbound + outbound minutes",
    costPerCall: "$0.014/min inbound, $0.022/min outbound",
    expectedCallsPerJob: 2,
    baselineCalls: 40,         // inbound sales/service calls happen all day regardless of jobs on board
  },
  {
    service: "deepgram",
    label: "Deepgram (transcription)",
    dailyCostUsd: 3.0,
    dailyCalls: 200,
    expectedDailyCalls: "~10–80 (one per recorded call/voicemail)",
    costPerCall: "~$0.0043 per minute (nova-3)",
    expectedCallsPerJob: 1,
    baselineCalls: 20,         // transcribes every inbound call
  },
  {
    service: "sendgrid",
    label: "SendGrid (email)",
    dailyCostUsd: 2.0,
    dailyCalls: 500,
    expectedDailyCalls: "~20–200 (replies + automated)",
    costPerCall: "$0.0008 per message",
    expectedCallsPerJob: 3,
    baselineCalls: 40,         // vendor + customer replies all day
  },
  {
    service: "firecrawl",
    label: "Firecrawl (scraping)",
    dailyCostUsd: 3.0,
    dailyCalls: 100,
    expectedDailyCalls: "~5–40 (AHRI lookups, permit checks)",
    costPerCall: "~$0.015 per scrape",
    expectedCallsPerJob: 1,
    baselineCalls: 0,
  },
];

/** Compute the dynamic expected ceiling for a service given today's active job count. */
export function getExpectedCeiling(limit: ApiServiceLimit, activeJobCount: number): number | null {
  if (limit.expectedCallsPerJob == null) return null;
  return (limit.baselineCalls || 0) + limit.expectedCallsPerJob * Math.max(0, activeJobCount);
}

export function getLimitForService(service: string): ApiServiceLimit | undefined {
  return API_COST_LIMITS.find(l => l.service === service);
}

/** Get severity for a given current usage. */
export type AlertSeverity = "ok" | "warning" | "critical";

/**
 * Severity is now workload-aware. When an `activeJobCount` is supplied we
 * compare actual calls/cost to the dynamic ceiling (baseline + per-job × jobs):
 *   - critical = ≥ 3× expected ceiling   (real runaway)
 *   - warning  = ≥ 1.5× expected ceiling
 * Falls back to the static daily limits only if no ceiling is defined.
 */
export function getSeverity(
  currentCostUsd: number,
  currentCalls: number,
  limit: ApiServiceLimit,
  activeJobCount?: number,
): AlertSeverity {
  const ceiling =
    activeJobCount != null ? getExpectedCeiling(limit, activeJobCount) : null;

  if (ceiling != null && ceiling > 0) {
    const ratio = currentCalls / ceiling;
    if (ratio >= 3) return "critical";
    if (ratio >= 1.5) return "warning";
    return "ok";
  }

  // Fallback: static daily limits
  if (currentCostUsd >= limit.dailyCostUsd || currentCalls >= limit.dailyCalls) return "critical";
  if (currentCostUsd >= limit.dailyCostUsd * 0.8 || currentCalls >= limit.dailyCalls * 0.8) return "warning";
  return "ok";
}
