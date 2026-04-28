# UltraOffice2.0 Takeover Audit

Generated: April 26, 2026

## Bottom Line

Yes, this is a strong starting point for UltraOffice2.0.

The zip contains a complete Vite/React/Supabase app, it installs, it builds, and it runs locally at `http://127.0.0.1:4174`. Using the normal app login flow, the old Supabase project is readable as the admin user and we exported the business data that RLS allowed that user to see.

This does not mean we have a perfect database clone yet. It means we have enough code, schema history, functions, and exported live data to start taking the project over cleanly.

## What We Have

- App code extracted from `UltraOffice (1).zip`
- Local working app folder: `C:\Users\draxn\Documents\Codex\2026-04-24\UltraOffice2.0`
- Local data export folder: `C:\Users\draxn\Documents\Codex\2026-04-24\UltraOffice2.0\exports\old-supabase-2026-04-26T10-44-26-328Z`
- Inventory file: `C:\Users\draxn\Documents\Codex\2026-04-24\UltraOffice2.0\docs\ultraoffice20-takeover-inventory.json`
- 53 app pages
- 109 Supabase edge functions
- 385 migration files
- 137 readable tables/views
- 89 tables/views with data
- 88 non-empty tables exported to JSON

## Important Data Found

These are the tables that look like actual business value:

| Area | Tables | Count Notes |
| --- | --- | --- |
| Customers | `customers`, `customer_addresses` | 1,743 customers, 2,040 addresses |
| Jobs | `jobs`, `job_line_items`, `job_reminders`, `job_attachments` | 2,426 jobs, 2,833 attachment records |
| Estimates | `estimates`, `estimate_reviews`, `estimate_presentations`, `estimate_responses` | 2,103 estimates |
| Invoices | `customer_invoices`, `customer_invoice_items` | 1,952 invoices, 3,785 invoice items |
| Communication | `sms_log`, `call_log`, `voicemails`, `live_transcripts` | 2,215 SMS rows, 676 calls, 819 transcripts |
| Agreements | `service_agreements`, agreement-related tables | 244 service agreements |
| AI/JARVIS | `knowledge_chunks`, `copilot_messages`, `copilot_sessions`, `copilot_training` | Real historical assistant/context data |
| Phone/IVR | `ivr_config`, `ivr_menu_options`, `call_routing_rules`, Twilio functions | Present, but needs design cleanup |
| Catalog/Pricing | `repair_catalog`, `equipment_matchups`, `ahri_lookups`, pricing tables | Useful foundation |

## Quarantine / Do Not Treat As Core

`api_usage_log` has 100,013 rows. Based on your note, this was supposed to be a rolling cost checker and should have deleted old rows daily. I skipped exporting that table as business data.

Recommended fix:

- Add a retention policy for this table.
- Keep only a short window, probably 7 to 30 days.
- Add a daily cleanup job.
- Do not migrate old rows into the new source-of-truth database.

## Keep, But Rework Carefully

These systems are valuable but should not be blindly copied as final UltraOffice2.0 behavior:

- HCP import/sync functions
- Twilio voice/SMS functions
- IVR builder and call routing
- JARVIS/copilot tools
- Tech forms and finalization flow
- Sales presentation/estimate flow
- Repair catalog and quick quote

The direction should be: preserve the data and workflows, then make UltraOffice the source of truth. HCP should become import/history/fallback during transition, not the center of the app.

## Rebuild From Scratch

Per your direction, these should be rebuilt instead of trusted as final:

- Stripe webhooks
- Customer portal
- Customer cart / checkout behavior
- Workflow automations

Important nuance: some of these tables have useful historical data, especially carts and invoices. We should preserve the records, but rebuild the live behavior.

## Missing Pieces Before A True Clone

The export is not the same as a full admin database dump. Still missing or not guaranteed:

- Supabase auth internals beyond what the app exposes
- Storage bucket files themselves, such as uploaded job photos/documents
- Supabase project secrets for deployed functions
- Scheduled cron settings
- Realtime/webhook provider settings outside code
- Any external dashboards, like Twilio, Stripe, Google, Meta, HCP, Render, or Lovable config

That was normal during takeover. UltraOffice2.0 now has its canonical Supabase project, so this section is historical context rather than current setup instructions.

## Recommended Next Sequence

1. Freeze this snapshot.
   Keep the current code zip, export folder, and inventory as the takeover baseline.

2. Create the UltraOffice2.0 Supabase target.
   Completed: the canonical project is `tqkqqjvddfrcxrxfvzvz`.

3. Import core tables first.
   Start with customers, addresses, jobs, estimates, invoices, invoice items, SMS, calls, employees, agreements, catalog/pricing, and IVR config.

4. Download/verify storage assets.
   Job photos and attachments need their actual files, not just metadata rows.

5. Smoke-test the old app routes locally.
   Confirm login, schedule, customer detail, job detail, inbox, IVR builder, admin, quick quote, tech schedule, and estimate detail.

6. Rewrite the architecture direction.
   Update the project docs from "HCP-first overlay" to "UltraOffice-first operating system."

7. Rebuild risky modules one at a time.
   Start with schedule/jobs/customers/inbox, then IVR/phone, then estimates/invoices, then tech forms, then payments/portal/workflows.

## My Recommendation

Do not wipe the current database.

The best move is to build UltraOffice2.0 beside the old system first, import the clean business data into staging, and make the staging app prove it can run the daily workflow. Once it can handle schedule, customers, jobs, calls/SMS, estimates, and invoices without HCP as the center, then we plan the cutover.
