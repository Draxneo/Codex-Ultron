# HCP API — Changelog (Complete)

> Full changelog from https://docs.housecallpro.com/docs/housecall-public-api/06ba3d648e345-changelog
> [RSS Feed](https://zapier.com/engine/rss/14274546/housecallpro-api-changelog)

---

## 2026

### Apr 06, 2026
- **POST /jobs/lock**: Response payload updated to return only `id` and `locked_at` per job.

### Mar 30, 2026
- Add support for updating franchise company metadata with `PATCH /company/franchise_info`.
- `GET /company` now includes `franchise_info` for franchise companies.
- Franchise metadata supports: `metadata.territory_management.franchise_id`, `metadata.franchisee_identifier`, `metadata.external` custom key-value.

### Mar 03, 2026
- Add `canceled_at` and `deleted_at` to Job protocol and webhooks. `canceled_at` = user canceled (ISO8601 UTC); `deleted_at` = pro canceled/deleted.
- Add `lost_at` to Lead protocol and webhooks.

### Feb 18, 2026
- Add `GET /pipeline/statuses` for listing pipeline statuses.
- **Booking Availability** (`GET /company/schedule_availability/booking_windows`): Now uses correct service duration. New `service_duration` param overrides service_id duration.

### Feb 03, 2026
- Add support for updating pipeline status for leads, jobs, and estimates.

### Jan 27, 2026
- Add bulk updating estimate option line items (`PUT /estimates/{id}/options/{id}/line_items/bulk_update`).

### Jan 22, 2026
- Add Service Zones List endpoint.

### Jan 20, 2026
- Exposing `created_at` on employee protocol.

### Jan 05, 2026
- Add `job_id` to invoice webhooks.
- Add `recurrence_number` and `recurrence_rule` to job protocol.
- Add support for listing lead line items.

---

## 2025

### Dec 18, 2025
- Add support for listing estimate line items.

### Dec 05, 2025
- Add support for Pricebook services.

### Dec 01, 2025
- Add support for creating jobs with `anytime` schedule.

### Nov 24, 2025
- Add Invoice webhook events.
- Add `id` field to InvoiceItem, InvoiceTax, InvoiceDiscount, InvoicePayment.

### Nov 20, 2025
- Add sorting for invoices list endpoint.

### Nov 13, 2025
- Add `event_created_at` to all webhook objects.

### Nov 11, 2025
- Add approve estimate options (`POST /estimates/options/approve`).
- Add decline estimate options (`POST /estimates/options/decline`).

### Nov 10, 2025
- Added `pipeline_status` to Lead response.

### Oct 27, 2025
- Add lead conversion (`POST /leads/{id}/convert`) to job or estimate.

### Oct 23, 2025
- Added `X-Company-Id` header support for multi-location accounts.

### Oct 20, 2025
- Updated line item `kind` enum: removed `tax`, ensured `percent discount` documented everywhere.

### Oct 01, 2025
- Lock Job by ID (`POST /jobs/{id}/lock`).
- Lock Jobs by time range (`POST /jobs/lock`).

### Sep 24, 2025
- Get single invoice by UUID (`GET /invoices/{uuid}`).
- Preview invoice as HTML (`GET /invoices/{uuid}/preview`).

### Sep 23, 2025
- Added `subtotal` to Invoice object.
- Bulk line items update supports `line_item.id` (not just `uuid`).

---

## 2024

### Oct 17, 2024
- Pricebook materials support.

### May 28, 2024
- Job invoices list endpoint.

### April 24, 2024
- **[BREAKING]** POST attachment endpoints now only accept binary files.

---

## 2023

### Dec 06, 2023
- **[BREAKING]** Updates to response objects and HTTP codes for Job/Estimate Attachments.

### Nov 21, 2023
- Fix OAuth token expiration validation. Expired tokens return 401.

### Jul 28, 2023
- Multi-day job appointments support.
- Update `lead.deleted` webhook protocol.

### Jun 06, 2023
- Expand `attachments` for Get Job(s), Estimate(s), Customer(s).
- Estimate Schedule Update endpoint.

### May 15, 2023
- Leads list filter by `location_ids`.

### May 11, 2023
- Job Fields in Job creation/response.
- Estimate Fields in Estimate creation/response.

### April 25, 2023
- Job Types List, Create, Update endpoints.

### April 20, 2023
- Estimate attachments creation.

### March 27, 2023
- Lead Sources List, Create, Update endpoints.

### March 23, 2023
- Customer Update endpoint.
- Estimate notes Create/Update.
- Job notes Create/Update.

### March 07, 2023
- Leads List endpoint.
- Leads webhook events.

### February 16, 2023
- Leads Create and Show endpoints.
