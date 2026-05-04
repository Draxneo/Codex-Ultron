---
name: System Resilience & On-Call
description: Edge function hardening with withRetry, retry_queue, pageOnCall SMS to ONCALL_ADMIN_PHONE on critical failures.
type: feature
---
# System Resilience Layer

**Shared helpers** in `supabase/functions/_shared/resilience.ts`:
- `withRetry` / `fetchWithRetry` — exponential backoff (3 attempts, jitter) for 429/5xx/network errors
- `logSystemError` — writes to `public.system_error_log` via RPC
- `enqueueRetry` — pushes failed ops to `public.retry_queue` for replay
- `pageOnCall` — direct Twilio REST SMS to `ONCALL_ADMIN_PHONE` (+12107718430), 30-min dedup via `oncall_alerts.dedup_key`

**Hardened functions:**
- `send-sms` — Twilio retry + queue + page on exhaustion
- `upload-to-hcp` — HCP retry + queue per file
- `stripe-webhook` — pages admin on any 500 (revenue events)
- `hcp-webhook` — pages admin on any 500 (source-of-truth drift)
- `send-push` — pages only on FCM auth/service-account failures (not per-token errors)

**Cron**: `retry-queue-processor-every-minute` drains `retry_queue` with incremental backoff (30s → 6h cap), moves exhausted to `dead_letter` and pages admin.

**Dashboard**: `/system-log` (Mission Control, admin-only) — errors/cron health/retry queue/on-call alerts. Top-nav `<SystemStatusIndicator />` polls every 60s and pulses red when issues exist.

**Critical alert number**: +12107718430 — system failures only (HCP/Stripe/Twilio down, cron stalls, FCM auth, retry exhaustion).
