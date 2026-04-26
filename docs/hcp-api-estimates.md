# HCP API — Estimates

## GET /estimates — List Estimates

```
GET https://api.housecallpro.com/estimates
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | string | Page number (default: 1) |
| `page_size` | number | Results per page (default: 10) |
| `customer_id` | string | Filter by customer ID |
| `employee_ids` | array | Filter by assigned pro IDs |
| `expand[]` | string | `attachments` |
| `location_ids` | array | Filter by location IDs |
| `scheduled_start_min` | ISO 8601 | Estimates starting after this date |
| `scheduled_start_max` | ISO 8601 | Estimates starting before this date |
| `scheduled_end_min` | ISO 8601 | Estimates ending after this date |
| `scheduled_end_max` | ISO 8601 | Estimates ending before this date |
| `sort_by` | string | `created_at` (default), `updated_at`, `id` |
| `sort_direction` | string | `asc` or `desc` (default) |
| `work_status` | array | Filter: `unscheduled`, `scheduled`, `in_progress`, `completed`, `canceled` |

**Response:**
```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 5,
  "total_items": 50,
  "estimates": [{
    "id": "string",
    "estimate_number": "string",
    "work_status": "string",
    "lead_source": "string",
    "customer": { ...Customer },
    "address": { ...Address },
    "created_at": "string",
    "updated_at": "string",
    "company_name": "string",
    "company_id": "string",
    "work_timestamps": { ...WorkTimestamps },
    "schedule": { ...Schedule },
    "assigned_employees": [{ ...Employee }],
    "estimate_fields": {},
    "options": [{ ...EstimateOption }]
  }]
}
```

---

## GET /estimates/{id} — Get an Estimate

```
GET https://api.housecallpro.com/estimates/{id}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `expand[]` | string | `attachments` |

---

## POST /estimates — Create an Estimate

```
POST https://api.housecallpro.com/estimates
```

---

## Estimate Schedule Endpoints

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/estimates/{id}/options/{option_id}/schedule` | Update estimate option schedule |

### Estimate Work Status Values

| Status | Description |
|--------|-------------|
| `unscheduled` | Not yet scheduled |
| `scheduled` | Has been scheduled |
| `in_progress` | Currently being worked |
| `completed` | Estimate completed |
| `canceled` | Estimate canceled |
