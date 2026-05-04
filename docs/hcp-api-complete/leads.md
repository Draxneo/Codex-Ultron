# HCP API — Leads (Complete)

> All lead endpoints from https://docs.housecallpro.com/docs/housecall-public-api

---

## POST /leads — Create Lead

```
POST https://api.housecallpro.com/leads
```

### Request Body
```json
{
  "customer_id": "string",
  "customer": {
    "first_name": "string",
    "last_name": "string",
    "email": "string",
    "notifications_enabled": true,
    "mobile_number": "string",
    "company": "string",
    "home_number": "string",
    "work_number": "string",
    "lead_source": "string",
    "notes": "string",
    "tags": ["string"],
    "addresses": [Address]
  },
  "assigned_employee_id": "string",
  "address_id": "string",
  "address": Address,
  "lead_source": "string",
  "line_items": [{
    "description": "string",
    "kind": "labor",
    "name": "string",
    "quantity": 1,
    "unit_cost": 0,
    "unit_price": 0
  }],
  "note": "string",
  "tags": ["string"],
  "tax_name": "string",
  "tax_rate": 0
}
```

**kind** values: `labor`, `materials`, `fixed discount`, `percent discount`

### Response (201)

### Lead Object
```json
{
  "id": "string",
  "number": 0,
  "customer": {
    "id": "string",
    "first_name": "string|null",
    "last_name": "string|null",
    "email": "string|null",
    "company": "string|null",
    "notifications_enabled": true,
    "mobile_number": "string|null",
    "home_number": "string|null",
    "work_number": "string|null",
    "tags": ["string"],
    "lead_source": "string|null"
  },
  "address": Address,
  "lead_source": "string",
  "tags": ["string"],
  "assigned_employee": Employee,
  "status": "open",
  "pipeline_status": "string",
  "company_name": "string",
  "company_id": "string",
  "lost_at": "string|null"
}
```

---

## GET /leads — List Leads

```
GET https://api.housecallpro.com/leads
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | string | 1 | Page number |
| `page_size` | number | 10 | Results per page |
| `customer_id` | string | — | Filter by customer |
| `employee_ids` | array | — | Filter by employees |
| `lead_source` | array | — | Filter by lead source |
| `location_ids` | array | — | Filter by location |
| `sort_by` | string | `created_at` | `created_at`, `updated_at`, `id`, `status` |
| `sort_direction` | string | `desc` | `asc` or `desc` |
| `status` | string | — | `lost`, `open`, `won` |
| `tag_ids` | array | — | Filter by tag IDs |

---

## GET /leads/{id} — Get Lead

```
GET https://api.housecallpro.com/leads/{id}
```

Returns Lead object.

---

## POST /leads/{id}/convert — Convert Lead to Estimate or Job

```
POST https://api.housecallpro.com/leads/{id}/convert
```

### Request Body
```json
{
  "type": "estimate"
}
```

**type** values: `estimate`, `job`

### Response (201)
```json
{
  "job_id": "string",
  "estimate_id": "string"
}
```

Only one of `job_id` or `estimate_id` will be present based on conversion type.

Added Oct 2025.

---

## Lead Status Values

| Status | Description |
|--------|-------------|
| `open` | Active lead |
| `won` | Converted to job/estimate |
| `lost` | Did not convert |

---

## GET /leads/{lead_id}/line_items — List Lead Line Items

```
GET https://api.housecallpro.com/leads/{lead_id}/line_items
```

Added Jan 2026.

---

## Lead Sources

### GET /lead_sources — List Lead Sources
```
GET https://api.housecallpro.com/lead_sources
```

### POST /lead_sources — Create Lead Source
```
POST https://api.housecallpro.com/lead_sources
```

### PUT /lead_sources/{id} — Update Lead Source
```
PUT https://api.housecallpro.com/lead_sources/{id}
```
