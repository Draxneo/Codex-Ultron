# HCP API — Leads

## GET /leads — List Leads

```
GET https://api.housecallpro.com/leads
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | string | Page number (default: 1) |
| `page_size` | number | Results per page (default: 10) |
| `customer_id` | string | Filter by customer ID |
| `employee_ids` | array | Filter by employee IDs |
| `lead_source` | array | Filter by lead source |
| `location_ids` | array | Filter by location IDs |
| `sort_by` | string | `created_at` (default), `updated_at`, `id`, `status` |
| `sort_direction` | string | `asc` or `desc` (default) |
| `status` | string | Filter: `lost`, `open`, `won` |
| `tag_ids` | array | Filter by tag IDs |

**Response:**
```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 5,
  "total_items": 50,
  "leads": [{
    "id": "string",
    "number": 0,
    "customer": {
      "id": "string",
      "first_name": "string",
      "last_name": "string",
      "email": "string",
      "company": "string",
      "notifications_enabled": true,
      "mobile_number": "string",
      "home_number": "string",
      "work_number": "string",
      "tags": ["string"],
      "lead_source": "string"
    },
    "address": {
      "id": "string",
      "city": "string",
      "state": "string",
      "street": "string",
      "street_line_2": "string",
      "zip": "string"
    },
    "lead_source": "string",
    "tags": ["string"],
    "assigned_employee": { ...Employee },
    "status": "open",
    "pipeline_status": "string",
    "company_name": "string",
    "company_id": "string"
  }]
}
```

---

## POST /leads — Create a Lead

```
POST https://api.housecallpro.com/leads
```

---

## Lead Line Items

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leads/{id}/line_items` | List lead line items |
| POST | `/leads/{id}/line_items` | Add line item to lead |

### Lead Status Values

| Status | Description |
|--------|-------------|
| `open` | Active lead |
| `won` | Converted to job/estimate |
| `lost` | Did not convert |
