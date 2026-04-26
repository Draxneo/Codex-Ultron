# Organize Plus — HVAC Operations Platform

An HVAC operations platform that runs as a **communication and enrichment overlay on top of Housecall Pro (HCP)** — not a replacement. HCP is the source of truth for jobs, customers, estimates, and invoices. The local database is an overlay/cache that adds AI, telephony, dispatch intelligence, sales presentations, technician workflows, and customer-facing portals on top of it.

Powered by **JARVIS** (the Lovable AI gateway orchestrator) for the dispatcher copilot, CSR intake, parts sourcing, and multimodal chat. Unified Twilio + Deepgram telephony/SMS pipeline. Capacitor mobile shell for technicians. Electron desktop shell for the dispatch desk.

---

## ⚠️ Engineering Principles (read before writing any code)

These are non-negotiable. They exist because we burned ourselves repeatedly when we ignored them.

### 1. Build universal shared utilities first — never one-off
If logic is needed in **2+ places**, it MUST live in a shared location. No copy-paste, no "I'll refactor later."

| Logic type | Where it lives |
|---|---|
| Pure functions / formatters / parsers | `src/lib/` |
| React state, effects, queries, mutations | `src/hooks/` |
| Edge function helpers (Twilio, HCP, AI, auth, signatures, company info) | `supabase/functions/_shared/` |
| Reusable UI primitives | `src/components/ui/` (shadcn) or `src/components/shared/` |

Before creating a new file, **search for an existing helper first**. Most things you need are already built.

### 2. Centralized pipelines are non-negotiable
Every outbound action must route through its single canonical pipeline:

| Concern | Pipeline |
|---|---|
| Outbound SMS / MMS | `send-sms` (status → `sms-status-callback`, audit → `twilio-sms-inspect`) |
| Outbound voice | `voice-webhook` → `voice-ivr-handler` → `voice-status-callback` |
| Job / estimate creation | `create-hcp-job` → HCP webhook → `finalize-job` |
| AI inference | Lovable AI gateway via `LOVABLE_API_KEY` (no direct OpenAI/Gemini keys) |
| Email send | SendGrid via `send-email` (signed, DKIM, list-unsubscribe) |
| Push notifications | `send-push` (FCM HTTP v1) |
| Company name / phone / address | `loadCompanyInfo()` from `_shared/companyInfo.ts` |

If you find yourself calling Twilio/HCP/AI directly, stop — use the pipeline.

### 3. HCP-first, never local-first
Jobs and estimates are **never** inserted locally. Flow:
1. POST to HCP via `create-hcp-job`
2. HCP webhook fires
3. `hcp-webhook` creates the local row and calls `finalize-job` with `skip_hcp: true` for side effects (chat channel, line items, workflow attachment, activity log).

### 4. No hardcoded company identifiers
Company name, phone, email, address, TACLA — always read from `company_settings` via `loadCompanyInfo()`. No string literals.

### 5. Identity resolution order
Universal contact resolver order: **Employee → Customer → Vendor → Lead.** Use `resolveContact()` / `verifyContact()` from `_shared`, never roll your own.

### 6. Security
- Roles live in `user_roles` ONLY — never on `profiles` or `users`. Use `has_role(_user_id, _role)` (`SECURITY DEFINER`) inside RLS policies.
- All cross-table reads in DB functions use `SECURITY DEFINER` + explicit `search_path = public`.
- Twilio webhooks (voice + SMS) validate `X-Twilio-Signature` via `_shared/twilioSignature.ts`.
- Storage buckets (`mms-media`, `agent-documents`, `tech-photos`, etc.) have explicit RLS — never make a bucket public without reviewing policies.

### 7. AI is observer-only on inbound
JARVIS extracts intent and proposes actions, but **never** sends customer-facing messages without HITL (human-in-the-loop) approval. Approval flows live in the dispatcher action cards.

### 8. One Workflow, One Source
The "What's Next" engine is governed by the React Flow builder at `/workflow-builder`. Don't fork workflow logic into components — extend the builder.

### 9. Never edit auto-generated files
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env`
- `supabase/migrations/*` (always create new migrations via the migration tool)

---

## Core Architecture

| Layer | Stack |
|---|---|
| Frontend | Vite 5 · React 18 · TypeScript 5 · Tailwind v3 · shadcn/ui · React Query · React Router · React Flow · Framer Motion · Vaul |
| Backend | Lovable Cloud (Supabase) — Postgres + Edge Functions (Deno) + Storage + Realtime + pgvector |
| Mobile | Capacitor (Android) — hybrid shell that loads the published web URL. UI ships via Publish; no APK rebuild required. |
| Desktop | Electron shell pinned to a specific secondary monitor for the dispatch station. |
| AI | Lovable AI gateway (Gemini 2.5 / GPT-5 family) — single key, no per-provider config. |
| Integrations | Housecall Pro, Twilio (Voice + SMS + MMS), Deepgram, SendGrid, Stripe, Google Ads / LSA, Google Maps, Mapbox, Firecrawl, FCM |

---

## Key Subsystems

| Subsystem | Entry point |
|---|---|
| **JARVIS Orchestrator** (hub-and-spoke AI) | `supabase/functions/ai-task-agent` |
| **Centralized SMS Pipeline** | `send-sms`, `sms-status-callback`, `twilio-sms-inspect` |
| **Unified Telephony** (IVR, recording, callbacks, inspector) | `voice-webhook`, `voice-ivr-handler`, `voice-status-callback`, `twilio-call-inspect` |
| **HCP Sync Engine** (webhook-driven smart upsert) | `hcp-webhook`, `sync-hcp-jobs` |
| **Job Finalization Pipeline** | `finalize-job` |
| **CSR Intake** (popup with live Deepgram transcription + extraction) | `/csr-intake`, `csr-extract` |
| **Dispatch Board** | `/jobs/board` |
| **Workflow Builder** (React Flow) | `/workflow-builder` |
| **Tech Mobile Shell** (no swipe, bottom-tab nav, native keyboard support) | `/tech`, `MobileShell` |
| **Visual Pricebook** (Vaul drawer) | tech form line item picker |
| **Quick Quote** (deterministic, non-AI) | `/quick-quote` |
| **Sales Presentations** (customer-facing) | `/presentation/:token`, admin at `/sales-presentations` |
| **Customer Portal** (passwordless 6-digit PIN) | `/portal` |
| **Mission Control HUD** | `/mission-control` |
| **Vendor VRM** | `/vendors` |
| **Email Suite** (rich composer, signatures, unified Outbox) | `/inbox`, `/email` |
| **Workflow Sequence Builder** (drag-drop drip campaigns) | `/sequence-builder` |
| **Comfort Club** (memberships) | `/membership` |
| **CPS Energy Rebate Automation** | trigger on HCP install webhook |

---

## Repository Layout

```
src/
  components/         UI components — extend shared primitives, don't duplicate
    ui/               shadcn primitives
    shared/           our cross-feature reusable components
  hooks/              Reusable React logic — put queries/mutations/effects HERE
  lib/                Pure utilities — formatters, parsers, validators
  pages/              Route-level shells only (thin)
  data/               Static dictionaries (e.g., wordList for autocorrect)
  integrations/
    supabase/         AUTO-GENERATED — never edit

supabase/
  functions/
    _shared/          Shared edge utilities — REUSE BEFORE WRITING NEW
                      (companyInfo, twilioSignature, sendIvrSms, hcpClient,
                       apiUsageLog, resolveContact, verifyContact, ...)
    <function>/       One concern per function
  migrations/         SQL migrations only — never edit by hand, use migration tool

docs/                 HCP API reference (split by resource)
.lovable/
  memory/             Living project rules and architecture notes
  plan.md             Most recent audit / planning scratchpad
```

**Rule of thumb:** If you create a new file in `src/components/` and it isn't a route shell, ask whether the logic belongs in `src/hooks/` or `src/lib/` first.

---

## Local Development

```sh
npm i
npm run dev   # Vite, strictPort: true on :8080
```

- `.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts` are **auto-generated** by Lovable Cloud — never edit them by hand.
- Edge functions deploy automatically on save.
- Database changes go through the migration tool (which writes to `supabase/migrations/`); never hand-edit migration files.

---

## Deployment

- **Web:** Lovable → Share → Publish.
- **Custom domain:** Project Settings → Domains.
- **Android APK:** Hybrid Capacitor build. UI updates ship via Publish — no native rebuild for content/UI changes. Native rebuild is only required when Capacitor plugins or permissions change.
- **Desktop:** Electron shell, pinned to DISPLAY1 secondary monitor for dispatch station.

---

## Where to Learn More

- **`docs/hcp-api.md`** — Complete Housecall Pro API reference (jobs, customers, estimates, invoices, leads, employees, webhooks)
- **`docs/hcp-api-integration.md`** — Our HCP field mappings, job-type detection, sync strategy
- **`.lovable/memory/index.md`** — Living project rules: the 6 core rules, JARVIS policies, branding constraints, security hardening
- **`.lovable/memory/architecture/*`** — Per-subsystem architecture notes (HCP-first job creation, webhook sync engine, job finalization pipeline, JARVIS orchestrator, electron shell, llm gateway enforcement, centralized SMS pipeline)
- **`.lovable/memory/features/*`** — Per-feature notes (dispatch board, workflow builder, sales presentations, voice IVR, customer portal, ...)
- **`.lovable/plan.md`** — Most recent audit / planning notes

---

## The 6 Core Rules (cheat sheet)

1. **One Workflow** — extend the builder, don't fork logic.
2. **One Source of Truth** — HCP for jobs/customers, `company_settings` for identity, `user_roles` for permissions.
3. **Centralized Pipelines** — `send-sms`, `voice-webhook`, `create-hcp-job`, Lovable AI gateway.
4. **HCP-First** — never insert jobs/estimates locally; wait for the webhook.
5. **HITL on Inbound** — AI proposes, humans approve before any customer-facing send.
6. **Verify Before You Write** — use `verifyContact` / `resolveContact` for all phone/email lookups.

If your change violates one of these, stop and reconsider the design.
