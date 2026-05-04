# UltraOffice2.0

UltraOffice2.0 is the Carnes and Sons HVAC operations platform. It is being rebuilt to become the company-owned source of truth for daily work: customers, jobs, estimates, invoices, calls, SMS/MMS, technician forms, carts, payments, agreements, attachments, and JARVIS action items.

Housecall Pro is no longer the operating center of the app. HCP is kept only for transition support: historical import, attachment backfill, emergency comparison, and temporary bridges that are explicitly guarded.

## Product Direction

- **UltraOffice owns new work.** New customers, jobs, estimates, invoices, notes, photos, carts, and payments should be written to UltraOffice data first.
- **HCP is transition-only.** HCP import/sync functions may remain until historical data is complete, but they should not be treated as the default path for new operations.
- **Attention First.** The old workflow builder is retired. "What's next" comes from action items, communications, invoices, photos, call/SMS history, cart/payment state, and AI-readable job/estimate context.
- **Human in the loop.** JARVIS can understand, draft, and propose, but customer-facing messages and important business actions require human approval unless a specific exception is documented.
- **One source of truth per concern.** Shared utilities and canonical pipelines must be used instead of feature-by-feature one-off logic.

## Core Workflows

| Area | Source of truth / pipeline |
|---|---|
| Calls and IVR | `voice-webhook`, `voice-ivr-handler`, `voice-status-callback`, IVR canvas config |
| SMS/MMS | `send-sms`, `sms-webhook`, `sms-status-callback`, shared media renderer |
| Customers | UltraOffice database, `resolveContact` / `verifyContact` for lookup |
| Jobs and estimates | UltraOffice database and shared job/estimate detail model |
| Invoices and payments | UltraOffice invoice/cart data, Stripe checkout where applicable |
| Tech work | Tech app forms, photos, JARVIS tech assistant, job status actions |
| JARVIS | Human-approved action cards and shared context builders |
| HCP history | Import/archive functions only, not default new-work writes |

## Engineering Rules

1. Search for an existing helper before creating new logic.
2. Put reusable pure logic in `src/lib/`.
3. Put reusable React data/state logic in `src/hooks/`.
4. Put shared Edge Function helpers in `supabase/functions/_shared/`.
5. Keep route pages thin; do not hide business rules inside page components.
6. Do not hardcode company identity, secrets, phone numbers, or API keys.
7. Do not put server secrets in frontend env files.
8. Do not call Twilio, Stripe, OpenAI, HCP, or Google directly from random UI code when a canonical function/helper exists.

## Environment Contract

Frontend env files (`.env`, `.env.local`) are public-only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- optional `VITE_GOOGLE_MAPS_API_KEY`

Server secrets belong in Supabase secrets, Render environment variables, or `.env.tools.local` for local tooling only.

Run:

```sh
npm run env:audit
```

## Current Stack

| Layer | Stack |
|---|---|
| Frontend | Vite, React, TypeScript, Tailwind, shadcn/ui, React Query, React Router |
| Backend | Supabase Postgres, Edge Functions, Storage, Realtime |
| Voice/SMS | Twilio Programmable Voice, Twilio Voice SDK, Twilio SMS/MMS |
| AI | OpenAI-backed JARVIS functions |
| Transcription | Deepgram |
| Payments | Stripe |
| Routing/property helpers | Google Maps, Firecrawl, cached API usage |
| Mobile | Capacitor Android shell |
| Desktop | Electron dispatch shell |
| Deploy | Render, GitHub `main` |

## Repository Layout

```text
src/
  components/         reusable UI components
  hooks/              reusable React logic
  lib/                pure utilities
  pages/              route shells
  integrations/
    supabase/         generated Supabase client/types

supabase/
  functions/
    _shared/          shared Edge Function utilities
    <function>/       one concern per function
  migrations/         SQL migrations

docs/                 operating decisions, cleanup plans, HCP history/import references
scripts/              local maintenance/audit scripts
```

## Useful Docs

- `docs/ultraoffice-core-scope.md`
- `docs/ultraoffice20-operating-decisions.md`
- `docs/ultraoffice20-integrations-source-of-truth.md`
- `docs/ultraoffice20-master-cleanup-list.md`
- `docs/ui-jarvis-function-inventory.md`
- `docs/phone-system-rebuild.md`
- `docs/sms-sending-policy.md`
- `docs/hcp-full-history-migration-plan.md`

## Local Development

```sh
npm i
npm run env:audit
npm run dev
```

Before shipping:

```sh
npm run env:audit
npx tsc --noEmit
npm run build
```
