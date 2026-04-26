# HCP API — Our Integration Notes

## Job Type Detection

HCP doesn't have a clean "job type" field. We determine type by:
1. Check `tags[]` for: `install`, `maintenance`, `repair`, `service`
2. Check `description` for keywords
3. Check `job_type` field if present
4. Default to `service` if unclear

---

## Fields We Use from HCP Jobs

| HCP Field | Our Field | Notes |
|-----------|-----------|-------|
| `id` | `hcp_id` | Unique identifier |
| `invoice_number` | `hcp_job_number` | Display number |
| `customer.first_name` + `customer.last_name` | `customer_name` | Combined |
| `customer.mobile_number` | `customer_phone` | Fallback to home_number |
| `address.*` | `address` | Formatted string |
| `work_status` | `hcp_status` | Status in HCP |
| `schedule.scheduled_start` | `scheduled_date` | Date only |
| `assigned_employees[0]` | `assigned_to` | First assigned tech |
| `tags[]` / `description` | `job_type` | Parsed (see above) |

---

## Sync Strategy

- Pull jobs using `GET /jobs?page_size=200`
- Paginate through all pages using `total_pages`
- Upsert by `hcp_id` (HCP's job `id`)
- New jobs get task templates auto-attached
- Existing jobs get metadata updated
- Sync runs via edge function `sync-hcp-jobs`

---

## Potential Future Integrations

### Webhooks (Real-time sync)
Instead of polling, use `job.created` and `job.completed` webhooks to:
- Auto-create jobs + tasks when scheduled in HCP
- Auto-update status when job completes

### Invoices
Track invoice status to auto-complete "Invoice sent" tasks.

### Estimates → Jobs
When an estimate is won, auto-create pre-job tasks before the job is even created.

### Customer Data
Sync customer info for richer job detail views.
