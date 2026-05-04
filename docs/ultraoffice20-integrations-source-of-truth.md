# UltraOffice2.0 Integrations Source Of Truth

This is the current integration map for UltraOffice2.0. Do not store secrets in this document.

## Live App

- Render service: `Codex-Ultron`
- Live URL: `https://codex-ultron.onrender.com/`
- GitHub repo: `https://github.com/Draxneo/Codex-Ultron`
- Branch: `main`

Render deploys from GitHub. Local commits pushed to `main` are expected to trigger a new Render build.

## Supabase

- UltraOffice2.0 canonical project ref: `tqkqqjvddfrcxrxfvzvz`
- Core imported data: 29,942 rows
- Intentionally skipped noisy table: `api_usage_log`

The app should use the UltraOffice2.0 Supabase URL and publishable key. Service-role keys must not be placed in frontend env files.

## Environment Files

Local frontend env files (`.env` and `.env.local`) are public-only Vite config:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

Do not put Twilio, Stripe, OpenAI, Supabase service-role, Render, HCP, or admin/session secrets in frontend env files.

Local tool-only secrets belong in `.env.tools.local`. Production server secrets belong in Supabase secrets or Render environment variables, not in the browser bundle.

Run `npm run env:audit` after env changes.

## Auth

The admin user for UltraOffice2.0 is `clint@carnesandsons.com`.

Do not write passwords into docs, commits, screenshots, or logs.

## Twilio

Only the test number currently points at the UltraOffice2.0 Supabase functions.

- Test number label: `LS NextDoor`
- Test number: `+1 726-266-5800`
- Voice webhook: `https://tqkqqjvddfrcxrxfvzvz.supabase.co/functions/v1/voice-webhook`
- SMS webhook: `https://tqkqqjvddfrcxrxfvzvz.supabase.co/functions/v1/sms-webhook`
- SMS status callback: `https://tqkqqjvddfrcxrxfvzvz.supabase.co/functions/v1/sms-status-callback`

Canonical Twilio server secret names:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_TWIML_APP_SID`
- `TWILIO_PHONE_NUMBER`
- optional `TWILIO_CALLER_ID` if different from `TWILIO_PHONE_NUMBER`
- optional `TWILIO_PUSH_CREDENTIAL_SID_FCM` for Android

Do not use old aliases like `TWILIO_API_KEY` or `TWILIO_API_SECRET`.

All other production Twilio numbers should remain pointed at the old system until an explicit cutover.

## Housecall Pro

UltraOffice2.0 is the operating source of truth. HCP is transition-only and should be used only for:

- historical jobs/customers/estimates/invoices
- attachments/photos that may require nested API retrieval
- emergency comparison during the cutover window

New customers, jobs, estimates, invoices, notes, and payments should not be pushed back to HCP by default.

## Rebuild From Scratch

These areas existed in the old app but should not be treated as finished foundations:

- Stripe webhooks
- customer portals
- customer cart/payment flow
- workflow automations
- payment flow

Do not use old hosted apps, old Supabase projects, or old local projects as runtime dependencies.
