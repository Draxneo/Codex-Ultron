# HCP ↔ Local Field Mapping Reference

> Use this doc to quickly trace where data comes from and where it goes.  
> Last updated: 2026-04-14

---

## Jobs: HCP → Local (`public.jobs`)

| HCP Field | Local Column | Notes |
|-----------|-------------|-------|
| `id` | `hcp_id` | Always starts with `job_` for real jobs. **`csr_` IDs are estimates — must NOT go into jobs table.** |
| `invoice_number` | `hcp_job_number`, `job_number` | The visible job number in HCP. We store it in both columns. |
| `description` | `description` | Free-text job description |
| `note` | `hcp_note` | Internal HCP note field |
| `customer.first_name` + `customer.last_name` | `customer_name` | Combined, title-cased via `formatName()` |
| `customer.mobile_number` | `customer_phone` | Falls back to `home_number`, `phone_number` |
| `customer.email` | `customer_email` | |
| `customer.id` | `hcp_customer_id` | Used to link to `public.customers` |
| `address.street`, `.city`, `.state`, `.zip` | `address` | Formatted into single string |
| `work_status` | `hcp_status` | Raw HCP status string |
| _(mapped from `hcp_status`)_ | `status` | Local workflow status: `new`, `scheduled`, `done`, `canceled` |
| `schedule.scheduled_start` | `scheduled_date` | Date portion only (YYYY-MM-DD) |
| `schedule.scheduled_start` | `arrival_start` | Full ISO timestamp for arrival window |
| `schedule.scheduled_end` | `arrival_end` | Full ISO timestamp for arrival window |
| `assigned_employees[0]` | `assigned_to` | First assigned tech's full name |
| `tags[]` / `description` / `job_type` | `job_type` | Parsed via `determineJobType()` — see logic in sync function |
| `created_at` | `created_at` | HCP creation timestamp |
| _(parsed from description)_ | `tonnage` | Regex-extracted from description |
| _(parsed from description)_ | `system_type` | `gas_heat`, `heat_pump`, `dual_fuel`, `straight_cool`, `electric_heat` |
| _(parsed from description)_ | `brand` | Brand name extracted from description |
| _(parsed from description + note)_ | `ahri_number` | AHRI certification number |

### App-Only Fields (not from HCP)

| Local Column | Purpose |
|-------------|---------|
| `customer_id` | FK to `public.customers` (resolved from `hcp_customer_id`) |
| `estimate_id` | FK to `public.estimates` if job was converted from estimate |
| `synced_at` | Timestamp of last HCP sync |
| `orientation` | `Horizontal` / `Vertical` — set by tech form responses |
| `workflow_id` | FK to workflow template |
| `workflow_started_at` | When workflow was activated |
| `is_warranty` | Boolean flag |
| `rebate_status` | Rebate tracking |
| `permit_status` | Permit tracking |

---

## Estimates: HCP → Local (`public.estimates`)

| HCP Field | Local Column | Notes |
|-----------|-------------|-------|
| `id` | `hcp_id` | Always starts with `csr_` |
| `estimate_number` | `estimate_number` | **The canonical display number.** Must match what HCP shows. |
| `description` | `description` | |
| `work_status` | `hcp_status` | Raw HCP status |
| _(mapped)_ | `work_status` | Local status: `new`, `scheduled`, `won`, `lost`, `canceled` |
| `customer.first_name` + `.last_name` | `customer_name` | Combined |
| `customer.mobile_number` | `customer_phone` | |
| `customer.email` | `customer_email` | |
| `customer.id` | `hcp_customer_id` | |
| `address.*` | `address` | Formatted string |
| `schedule.scheduled_start` | `scheduled_date` | Date only |
| `schedule.scheduled_start` | `arrival_start` | Full timestamp |
| `schedule.scheduled_end` | `arrival_end` | Full timestamp |
| `assigned_employees[0]` | `assigned_to` | First tech name |
| `options[].total_amount` | `total_amount` | From first/primary option |
| `lead_source` | `lead_source` | |

### App-Only Fields

| Local Column | Purpose |
|-------------|---------|
| `customer_id` | FK to `public.customers` |
| `source_job_id` | FK if estimate originated from a job |
| `status` | App-level status (may differ from `work_status`) |
| `synced_at` | Last sync timestamp |

---

## Customers: HCP → Local (`public.customers`)

| HCP Field | Local Column | Notes |
|-----------|-------------|-------|
| `id` | `hcp_customer_id` | HCP's customer ID |
| `first_name` | `first_name` | |
| `last_name` | `last_name` | |
| `email` | `email` | |
| `mobile_number` | `mobile_phone` | |
| `home_number` / `work_number` | `phone` | Fallback phone |
| `company` | `company` | |
| `addresses[0].street` | `address` | Primary address |
| `addresses[0].city` | `city` | |
| `addresses[0].state` | `state` | |
| `addresses[0].zip` | `zip` | |
| `notes` | `notes` | |
| `tags` | `tags` | String array |

---

## Known Gotchas & Edge Cases

### 1. `csr_` vs `job_` IDs
- **Estimates** always have `csr_` prefixed IDs in HCP
- **Jobs** always have `job_` prefixed IDs
- When an estimate is "won" in HCP, a new `job_` record is created
- HCP also fires a phantom `job.created` event with the `csr_` ID — **this must be ignored** in the webhook and sync

### 2. `invoice_number` vs `estimate_number`
- HCP calls both "numbers" but they're different sequences
- Jobs use `invoice_number` → stored as `job_number` and `hcp_job_number`
- Estimates use `estimate_number` → stored as `estimate_number`
- **Never** use `invoice_number` for estimates or vice versa

### 3. Estimate-to-Job Conversion
- When estimate is won, HCP creates a new job with a `job_` ID
- The local estimate's `work_status` should update to `won`
- A new row appears in `public.jobs` with `estimate_id` linking back
- The old `csr_` estimate row stays in `public.estimates`

### 4. Reassignment Sync
- HCP webhook fires `estimate.updated` or `job.updated` on reassignment
- The `assigned_employees[0]` field updates to the new tech
- Our sync maps this to `assigned_to` (tech's full name)
- The 2-minute cron (`sync-hcp-jobs`) also catches reassignments as fallback

### 5. Deduplication Rules
- Dispatch board only suppresses estimates when a **real job** (`job_type != 'estimate'`) shares the same `hcp_id`
- Ghost rows where `job_type = 'estimate'` in the jobs table do NOT suppress the real estimate

### 6. Work Status Mapping

| HCP `work_status` | Local Job `status` | Local Estimate `work_status` |
|---|---|---|
| `needs scheduling` | `new` | `new` |
| `scheduled` | `scheduled` | `scheduled` |
| `in progress` | `scheduled` | `scheduled` |
| `dispatched` | `scheduled` | — |
| `complete unrated` | `done` | — |
| `complete rated` | `done` | — |
| `completed` | — | `completed` |
| `user canceled` | `canceled` | `canceled` |
| `pro canceled` | `canceled` | `canceled` |
| `created job` / `won` | — | `won` |
