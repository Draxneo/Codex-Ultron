# UltraOffice2.0 Staging Database Plan

Generated: April 26, 2026

## Current Status

The app now runs against the UltraOffice2.0 Supabase project `tqkqqjvddfrcxrxfvzvz`. The old Supabase export exists only as archived migration material and should not be treated as a runtime dependency.

This machine does not currently have the Supabase CLI or Docker installed, so I cannot create a local Supabase stack directly from the migration folder yet. The safe next path is a new Supabase cloud staging project.

## What I Prepared

- Core table manifest: `scripts/staging-core-tables.json`
- Staging importer: `scripts/import-staging-core.mjs`
- Staging env template: `.env.staging.example`
- Import reports folder: `exports/staging-import-runs`

The importer refuses to run against discontinued Supabase projects.

## Clean Core Data

These are included in the first staging import:

- Company settings and employees
- Customers and customer addresses
- Jobs, job line items, reminders, attachments metadata
- Estimates
- Customer invoices and invoice items
- Service agreements
- Calls, SMS, transcripts
- IVR config, IVR menu options, call routing rules
- Repair catalog, pricebook, equipment matchups, AHRI lookups, pricing formulas
- Vendors and supply houses
- Leads, activity, action items, outbound drafts
- Tech forms
- JARVIS/copilot/knowledge data
- Presentations, quick quote, weather/cache/helper tables

These are intentionally skipped:

- `api_usage_log`, because it is noisy retention data
- View exports like `v_call_log_with_day` and `v_sms_log_with_day`, because views should be recreated by schema/migrations, not imported as base data

## If A Separate Staging Clone Is Needed

1. Create a new Supabase project named something like `UltraOffice2 Staging Clone`.
2. Run the migrations/schema into that project.
3. Put the new project URL and service-role key into a local staging env file.
4. Dry-run the import first.
5. Run the real import.
6. Point the app at the clone URL and anon key only for that test environment.
7. Smoke-test login, schedule, customers, jobs, inbox, IVR, estimates, invoices, admin, and tech pages.

## Model Swap Point

Stay on `GPT-5.5 low` while preparing files and checking local setup.

Switch to `GPT-5.5 medium` before actually applying migrations or importing into a cloud Supabase project.

Switch to `GPT-5.5 high` before any final cutover, HCP replacement decisions, auth/RLS redesign, payment wiring, or live phone/Twilio routing.
