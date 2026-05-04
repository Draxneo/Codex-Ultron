# HCP Full History Migration Plan

Goal: import every useful historical record from Housecall Pro into UltraOffice2.0 so HCP becomes a reference archive only, not the operating source of truth.

## What We Need To Own

- Customers and every known service address/property.
- Jobs, appointments, assigned employees, job status history, descriptions, private notes, job fields, tags, and timestamps.
- Estimates, estimate options, approval/decline status, linked converted jobs, scheduled times, descriptions, notes, and attachments.
- Invoices, invoice line items, taxes, discounts, payments, paid/sent/due dates, balances, and invoice PDFs or exported customer view URLs where possible.
- Job and estimate line items with names, descriptions, quantities, prices, discounts, taxes, and sort order.
- Attachments from customers, jobs, estimates, and equipment/property profiles, including photos, PDFs, videos, and documents.
- HCP IDs and raw source JSON for every imported object so we can re-run safely and prove where each row came from.

## Current State In UltraOffice2.0

We already have a partial HCP importer:

- `supabase/functions/import-hcp-history/index.ts`
  - imports jobs
  - imports estimates
  - imports customers discovered through jobs/estimates
  - imports job line items into local customer invoice tables
- `supabase/functions/archive-hcp-photos/index.ts`
  - fetches job attachments and stores files in `job-photos`
- `supabase/functions/fetch-job-attachments/index.ts`
  - fetches job attachments by HCP job ID
- `supabase/functions/sync-hcp-customers/index.ts`
  - customer sync helper
- `supabase/functions/sync-hcp-jobs/index.ts`
  - active/current job sync helper
- `supabase/functions/_shared/hcp-mapper.ts`
  - shared HCP-to-local job and estimate mapping helpers

Important gap: the current importer is not a complete historical archive. It does not yet fully import actual HCP invoices, payments, estimate option line items, notes/activity history, all customer/property attachments, or raw source snapshots.

## Migration Principles

1. Do not wipe the working database.
2. Import into staging/raw tables first, then normalize into app tables.
3. Keep every HCP ID forever.
4. Make every step resumable and idempotent.
5. Download attachments into Supabase storage, never depend on old temporary HCP URLs.
6. Store raw HCP JSON before transforming so we can fix mapping bugs without refetching everything.
7. Build a visible Dev/Ops migration dashboard with counts, errors, retries, and last imported page/date.
8. Compare totals against HCP before declaring the migration complete.

## Proposed Tables

### Raw Archive Tables

- `hcp_raw_customers`
- `hcp_raw_jobs`
- `hcp_raw_estimates`
- `hcp_raw_invoices`
- `hcp_raw_job_line_items`
- `hcp_raw_estimate_line_items`
- `hcp_raw_notes`
- `hcp_raw_attachments`
- `hcp_import_runs`
- `hcp_import_errors`

Each raw table should store:

- `id`
- `hcp_id`
- `source_type`
- `raw_json`
- `fetched_at`
- `normalized_at`
- `import_run_id`
- `hash`

### Normalized Target Tables

Use or extend:

- `customers`
- `customer_addresses` or equivalent property/address table
- `jobs`
- `estimates`
- `job_line_items`
- `estimate_line_items`
- `customer_invoices`
- `customer_invoice_items`
- `invoice_payments`
- `customer_notes`
- `job_notes`
- `estimate_notes`
- `job_attachments`
- `customer_attachments`
- `equipment`

If a target table does not exist yet, create it explicitly instead of stuffing unrelated JSON into an existing table.

## Import Order

1. Customers
2. Customer addresses/properties
3. Jobs
4. Estimates
5. Job line items
6. Estimate option/line items
7. Invoices
8. Invoice items, taxes, discounts, and payments
9. Notes and activity/history
10. Attachments metadata
11. Attachment file download/archive
12. Cross-link repair pass
13. Verification report
14. Final read-only HCP fallback mode

## Phase 1: API Capability Probe

Before pulling the full history, run small page-1 probes and save sample JSON for:

- `GET /customers`
- `GET /customers/{id}`
- `GET /jobs`
- `GET /jobs/{id}?expand[]=attachments&expand[]=appointments`
- `GET /jobs/{id}/line_items`
- `GET /estimates`
- `GET /estimates/{id}?expand[]=attachments`
- estimate option detail / line item endpoints if available
- `GET /invoices`
- any invoice detail endpoint if available
- any notes/activity endpoints available to this HCP account
- customer/profile attachment endpoints if available

Output should be saved as redacted JSON samples under `exports/hcp-samples/`.

Success criteria:

- We know the exact JSON shape for each resource.
- We know which fields are present in list calls vs detail calls.
- We know whether notes and customer/profile attachments are exposed through the API or require a secondary export path.

## Phase 2: Raw Full Pull

Build a single resumable function or script:

`scripts/hcp-full-history-import.ts` or `supabase/functions/import-hcp-full-history`

Requirements:

- accepts `resource`, `page`, `page_size`, `since`, and `mode`
- writes raw JSON first
- records page progress in `hcp_import_runs`
- respects HCP rate limits and `Retry-After`
- retries 429/500/timeout errors with backoff
- never overwrites newer local app-created rows unless the source is explicitly HCP-owned
- can run in dry-run mode

Suggested resources:

- `customers`
- `jobs`
- `job_details`
- `job_line_items`
- `estimates`
- `estimate_details`
- `estimate_line_items`
- `invoices`
- `invoice_details`
- `notes`
- `attachments`

## Phase 3: Normalize Into App Tables

Use a deterministic transformer layer:

- `mapHcpCustomerToLocal`
- `mapHcpAddressToLocal`
- `mapHcpJobToLocal`
- `mapHcpEstimateToLocal`
- `mapHcpInvoiceToLocal`
- `mapHcpLineItemToLocal`
- `mapHcpNoteToLocal`
- `mapHcpAttachmentToLocal`

Rules:

- Upsert by HCP ID.
- Preserve original HCP number fields exactly.
- Jobs use HCP `invoice_number` as local `job_number` / `hcp_job_number`.
- Estimates use HCP `estimate_number`.
- Keep estimate `csr_` IDs separate from job `job_` IDs.
- Link converted estimates to jobs when HCP provides the relationship or when numbers/customer/date make it provable.
- Preserve internal notes as internal notes, not customer-facing notes.

## Phase 4: Attachment Archive

Attachment import needs two passes:

1. Metadata pass:
   - source object type: customer, job, estimate, equipment/property
   - source HCP object ID
   - HCP attachment ID
   - file name
   - file type
   - original URL
   - created/uploaded timestamp

2. File pass:
   - download file using HCP/Twilio auth where required
   - store in Supabase bucket by source:
     - `job-photos`
     - `customer-attachments`
     - `estimate-attachments`
     - `equipment-attachments`
   - calculate checksum
   - mark archived/synced
   - keep failed downloads in retry queue

Do not rely on old temporary URLs. The app should render from our Supabase storage once imported.

## Phase 5: Verification

Build a Dev/Ops screen section:

- HCP customers found vs local customers imported
- HCP jobs found vs local jobs imported
- HCP estimates found vs local estimates imported
- HCP invoices found vs local invoices imported
- line item count by source
- attachments metadata count
- attachments downloaded count
- failed downloads
- unresolved customer links
- unresolved job/estimate links
- duplicate phone/email/address clusters
- total revenue imported by month
- invoices paid/unpaid totals

Success criteria:

- Every HCP customer has a local row or a logged skip reason.
- Every HCP job has a local row or a logged skip reason.
- Every HCP estimate has a local row or a logged skip reason.
- Every HCP invoice has a local row or a logged skip reason.
- Every attachment has either a local archived file or a permanent retry/error record.
- Random spot checks match HCP visually.

## Phase 6: Cutover Mode

After historical import:

- HCP becomes read-only fallback.
- New calls, SMS, jobs, estimates, invoices, payments, carts, photos, notes, and JARVIS actions are created in UltraOffice2.0 first.
- HCP sync code stays disabled unless explicitly run for final reconciliation.
- HCP links remain visible only as source/reference links while we verify history.

## Known Risks

- Some HCP URLs may be temporary and must be downloaded immediately after fetch.
- Some notes/activity history may not be fully exposed by public API. If so, use export/reporting or manual account export as a fallback.
- List endpoints may not include all detail fields; detail calls may be required for every job, estimate, invoice, and customer.
- Estimate options and invoice line item structures may differ from job line item structures.
- Rate limits will require slow, resumable batch jobs.
- Old data may contain duplicate customers, reused addresses, missing phone numbers, and inconsistent names.

## First Build Task

Create a migration probe tool that pulls one small sample from every HCP resource, stores the redacted raw JSON, and prints a capability report:

- supported endpoint
- sample count
- available key fields
- nested objects present
- attachment fields present
- line item fields present
- note fields present
- safe to import yes/no

This should happen before the full import.
