# UltraOffice2.0 Integrations Source Of Truth

This is the current integration map for the staging rebuild. Do not store secrets in this document.

## Live App

- Render service: `Codex-Ultron`
- Live URL: `https://codex-ultron.onrender.com/`
- GitHub repo: `https://github.com/Draxneo/Codex-Ultron`
- Branch: `main`

Render deploys from GitHub. Local commits pushed to `main` are expected to trigger a new Render build.

## Supabase

- UltraOffice2.0 staging project ref: `tqkqqjvddfrcxrxfvzvz`
- Core imported staging data: 29,942 rows
- Intentionally skipped noisy table: `api_usage_log`

The staging app should use the staging Supabase URL and publishable key. Service-role keys must not be placed in frontend env files.

## Auth

The admin user for staging is `clint@carnesandsons.com`.

Do not write passwords into docs, commits, screenshots, or logs.

## Twilio

Only the test number currently points at the UltraOffice2.0 staging Supabase functions.

- Test number label: `LS NextDoor`
- Test number: `+1 726-266-5800`
- Voice webhook: `https://tqkqqjvddfrcxrxfvzvz.supabase.co/functions/v1/voice-webhook`
- SMS webhook: `https://tqkqqjvddfrcxrxfvzvz.supabase.co/functions/v1/sms-webhook`
- SMS status callback: `https://tqkqqjvddfrcxrxfvzvz.supabase.co/functions/v1/sms-status-callback`

All other production Twilio numbers should remain pointed at the old system until an explicit cutover.

## Housecall Pro

HCP data is still important during the transition, especially for:

- historical jobs/customers/estimates/invoices
- attachments/photos that may require nested API retrieval
- validating job and estimate numbers against HCP

The long-term goal is to stop relying on HCP as the operational source of truth.

## Rebuild From Scratch

These areas existed in the old app but should not be treated as finished foundations:

- Stripe webhooks
- customer portals
- customer cart/payment flow
- workflow automations
- payment flow

Do not use old hosted apps, old Supabase projects, or old local projects as runtime dependencies.
