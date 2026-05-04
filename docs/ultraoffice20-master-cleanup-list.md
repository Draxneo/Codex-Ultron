# UltraOffice2.0 Master Cleanup List

This list comes from the parallel audit pass on April 26, 2026.

## Priority 1: Public Token Data Must Use Token-Scoped RPCs

Problem: public pages often load a safe token row, then query internal tables directly as anonymous users.

Fix pattern:
- Public page calls one `SECURITY DEFINER` RPC by token.
- RPC returns only the safe payload needed for that exact page.
- Browser does not directly query internal tables like `estimates`, `customers`, `company_settings`, `job_line_items`, or `service_repair_items`.

Targets:
- `CustomerPresentation.tsx`
- `useEstimatePresentations.ts`
- `AgreementPresentation.tsx`
- `useAgreementPresentations.ts`
- `CustomerCart.tsx`
- `companySettings.ts`

Specific work:
- Expand `get_public_estimate_presentation(token)` to include estimate fields, blocks, addons, and membership/discount display data.
- Add `submit_public_estimate_response(token, action, ...)` to handle response insert, estimate approval stamp, repair item approval, and job line item creation.
- Add `get_public_agreement_presentation(token)`.
- Include safe company display fields in `get_public_job_cart` or add `get_public_company_settings()`.

## Priority 2: Backfill And Enforce Local Customer Links

Problem: some HCP-era rows have `hcp_customer_id` but no local `customer_id`, so customer tabs/counts can look empty.

Targets:
- `jobs`
- `estimates`
- `get_customers_paginated`
- `get_customer_enrichment`
- `useCustomerHistory`
- `sync-hcp-jobs`

Specific work:
- Backfill `estimates.customer_id` from `customers.hcp_customer_id`.
- Confirm `jobs.customer_id` is fully backfilled.
- Update sync code so estimates resolve `customer_id` the same way jobs do.
- Make customer enrichment RPCs resilient while we transition away from HCP.

## Priority 3: One Work Queue

Problem: "What's next" is split across action items, workflow alerts, tech proposals, unmatched invoices, outbox approvals, expected job checklist logic, and old task/todo tables.

Targets:
- `action_items`
- `ActionItemCards.tsx`
- `NowTab.tsx`
- `useAttentionData.ts`
- `expectedJobItems.ts`
- `auto-advance-workflow`
- `workflow_definitions`
- `workflow_alerts`
- legacy `todos`, `task_templates`, `job_tasks`

Specific work:
- Make `action_items` the only actionable queue.
- Convert invoice exceptions, tech proposals, outbox approvals, cart approvals, stuck jobs, and expected job items into normalized action items.
- Build one action lifecycle service: accept, dismiss, complete, auto-close, audit.
- Retire old workflow-engine UI and route logic after action-item replacement exists.

## Priority 4: JARVIS Refactor To Remove Drift

Problem: JARVIS is currently one large orchestrator that mixes dispatcher copilot, tech assistant, model routing, direct mutations, and recommendation logic.

Target architecture:
- `jarvis-context-service`: one typed context packet for call/SMS/email/voicemail/job/customer.
- `jarvis-dispatcher-api`: dispatcher recommendations and action-item drafts.
- `jarvis-tech-api`: job-scoped field assistant.
- `jarvis-action-gateway`: all mutating actions pass through permission and approval checks.
- `jarvis-model-router`: backend-only source of truth for actual model selection.
- `jarvis-observability`: prompt version, context ID, model, tools exposed/called, approval state, and DB writes.

Specific drift to fix:
- Model UI can say GPT-5 while runtime downgrades GPT-5 models to GPT-4o Mini.
- `send-job-reminders` may create `action_items.status = open` while UI queries `pending`.
- Prompt sections, agent instructions, hardcoded tool routing, and frontend buttons all influence behavior separately.
- Tech assistant and dispatcher assistant share some code but not all permissions/context behavior.

## Priority 5: One Observability Home

Problem: System Log, API usage, trace events, retries, cron status, on-call status, and cost cards are split across tables/hooks/pages.

Targets:
- `SystemLog.tsx`
- `api_usage_log`
- `api_usage_daily_rollups`
- `system_trace_events`
- `retry_queue`
- `cron_job_runs`
- `service_health_snapshots`
- `oncall_alerts`
- `useApiUsageMetrics`
- `useApiCostAlerts`
- `useApiUsageHourly`

Specific work:
- Create one frontend observability hook/view model.
- Move API cost cards to rollups plus recent detail instead of raw long-lived log rows.
- Keep raw logs short-lived and self-cleaning.
- Fold duplicate monitor panels into System Log / Mission Control.

## Priority 6: Shared Utilities

Problem: frontend and Edge Functions mirror the same logic manually.

Targets:
- `src/lib/formatters.ts`
- `supabase/functions/_shared/formatters.ts`
- `src/lib/paymentOptions.ts`
- `supabase/functions/_shared/paymentOptions.ts`
- phone/date/money/media/SMS/model/permission helpers

Specific work:
- Create shared contracts and generated utilities where possible.
- Add smoke tests for phone formatting, money formatting, timezone/date behavior, payment options, and SMS normalization.
- Stop adding one-off local helpers inside pages/functions when a shared utility exists.

## Priority 7: SMS/MMS Test Number

Current test number status:
- Voice webhook: UltraOffice2.0 `voice-webhook`
- SMS/MMS webhook: UltraOffice2.0 `sms-webhook`
- SMS status callback: UltraOffice2.0 `sms-status-callback`
- Number capabilities: SMS, MMS, Voice

Test steps:
- Send a plain SMS to the test number.
- Send an MMS image to the test number.
- Verify new `sms_log` rows, media URL capture, JARVIS/context behavior, and System Log errors.
