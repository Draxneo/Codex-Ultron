# UltraOffice2.0 Product Principles

These principles are the operating compass for all future UltraOffice2.0 work.

## 1. One Source Of Truth

Every major business concept must have one canonical owner.

- Customers, properties, jobs, estimates, invoices, payments, SMS, calls, attachments, catalog items, equipment, repairs, action items, and monitoring data should each have one primary table/service/view.
- UI pages should read through the canonical source instead of inventing private query shapes.
- If a second representation is needed for performance, it should be a cache, rollup, or view with a clear rebuild path.

## 2. Universal Utilities

Avoid lego-style duplicate helpers scattered across pages and Edge Functions.

- Phone formatting, money formatting, dates/timezone, permissions, model routing, SMS sending, media handling, and payment math should live in shared utility modules.
- If browser and Edge Function code both need the same logic, create a shared/generated contract or clearly paired utility with tests.
- New features should reuse the shared utilities before adding a local helper.

## 3. One Work Queue: What's Next

UltraOffice should run the company from a single operational queue.

- `action_items` is the intended canonical queue for "What's next."
- JARVIS, tech forms, invoices, carts, calls, SMS, estimates, jobs, and monitors should emit normalized action items.
- Action items should auto-close when the expected real-world event happens, such as appointment scheduled, technician assigned, SMS sent, invoice paid, cart approved, or review requested.
- The old workflow engine should not be the primary operating model unless it is rebuilt around the action-item lifecycle.

## 4. JARVIS Tracks The Flow

JARVIS should be a dispatcher and tech assistant, not a loose chatbot.

- JARVIS should understand whether a customer already has an active job, estimate, property, invoice, or cart before suggesting a new record.
- For customers with multiple properties, JARVIS must clarify or infer the correct property from context instead of assuming the primary address.
- JARVIS should draft and recommend by default, then execute only through an explicit permission/approval path.
- JARVIS should explain the next best operational action and keep the shared action queue clean.

## 5. One Observability Home

Debug logs, API usage, cost checks, retries, cron health, Twilio traces, and monitors should be unified.

- System Log should become the single operational health center.
- Cost monitoring should use retained detail rows plus daily/hourly rollups, not endless raw logs.
- Duplicate panels that each show a different partial truth should be folded into one status model.

## 6. Test Before Trust

Business-critical flows need quick verification after changes.

- Phone, SMS/MMS, JARVIS actions, payments, carts, job creation, estimate approval, and invoice/payment status should have lightweight smoke tests.
- Webhook URLs must be verified against the UltraOffice2.0 Supabase project before testing live numbers.
- Secrets and service keys from discontinued projects must not be used for UltraOffice2.0.

## Current Consolidation Priorities

1. Make `action_items` the only actionable work queue.
2. Create one action lifecycle service for accept, dismiss, complete, auto-close, and audit.
3. Route JARVIS, expected job items, invoice exceptions, tech proposals, SMS drafts, and cart approvals into the same queue.
4. Build one observability hook/page for errors, traces, retries, cron, on-call, and API cost rollups.
5. Consolidate shared utilities for phone, date/timezone, money, SMS, media, model routing, and permissions.
6. Replace old workflow-engine surfaces with the "What's Next" action system.
