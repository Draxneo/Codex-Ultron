# HCP API — Estimates (Complete)

> All estimate endpoints from https://docs.housecallpro.com/docs/housecall-public-api

---

## GET /estimates — List Estimates

```
GET https://api.housecallpro.com/estimates
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Current page |
| `page_size` | number | 10 | Results per page |
| `q` | string | — | Search query |
| `customer_id` | string | — | Filter by customer |
| `sort_by` | string | `created_at` | Sort field |
| `sort_direction` | string | `desc` | `asc` or `desc` |
| `location_ids` | array | — | Filter by location |
| `expand` | array | — | `attachments` |
| `status[]` | array | — | Filter by status |

### Response (200)
```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 5,
  "total_items": 50,
  "estimates": [Estimate]
}
```

### Estimate Object
```json
{
  "id": "string",
  "estimate_number": "string",
  "description": "string",
  "status": "string",
  "customer": Customer,
  "address": Address,
  "options": [EstimateOption],
  "tags": [Tag],
  "lead_source": "string",
  "job_fields": {},
  "company_name": "string",
  "company_id": "string",
  "created_at": "string",
  "updated_at": "string"
}
```

---

## GET /estimates/{id} — Get Single Estimate

```
GET https://api.housecallpro.com/estimates/{id}
```

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `expand` | array | `attachments` |

### Response (200)
Returns Estimate object.

---

## POST /estimates — Create Estimate

```
POST https://api.housecallpro.com/estimates
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
  "address_id": "string",
  "address": Address,
  "description": "string",
  "options": [{
    "name": "string",
    "message": "string",
    "line_items": [{
      "name": "string",
      "description": "string",
      "unit_price": 0,
      "unit_cost": 0,
      "quantity": 1,
      "kind": "labor",
      "taxable": true
    }]
  }],
  "lead_source": "string",
  "note": "string",
  "tags": ["string"],
  "job_fields": {},
  "tax_name": "string",
  "tax_rate": 0
}
```

### Response (201)
Returns Estimate object.

---

## PUT /estimates/{estimate_id}/options/{option_id}/schedule — Update Option Schedule

```
PUT https://api.housecallpro.com/estimates/{estimate_id}/options/{option_id}/schedule
```

### Request Body
```json
{
  "scheduled_start": "2019-08-24T14:15:22Z",
  "scheduled_end": "2019-08-24T14:15:22Z",
  "arrival_window": {
    "start_time": "2019-08-24T14:15:22Z",
    "end_time": "2019-08-24T14:15:22Z"
  }
}
```

---

## POST /estimates/{estimate_id}/options/{option_id}/notes — Create Option Note

```
POST https://api.housecallpro.com/estimates/{estimate_id}/options/{option_id}/notes
```

### Request Body
```json
{
  "content": "string"
}
```

---

## DELETE /estimates/{estimate_id}/options/{option_id}/notes/{note_id} — Delete Option Note

```
DELETE https://api.housecallpro.com/estimates/{estimate_id}/options/{option_id}/notes/{note_id}
```

---

## POST /estimates/{estimate_id}/options/{option_id}/attachments — Create Option Attachment

```
POST https://api.housecallpro.com/estimates/{estimate_id}/options/{option_id}/attachments
```

Content-Type: `multipart/form-data` — Binary file upload only.

---

## POST /estimates/{estimate_id}/options/{option_id}/link — Create Option Link

```
POST https://api.housecallpro.com/estimates/{estimate_id}/options/{option_id}/link
```

Creates a shareable link for the estimate option.

---

## POST /estimates/options/approve — Approve Estimate Option

```
POST https://api.housecallpro.com/estimates/options/approve
```

Approves an estimate option (added Nov 2025).

---

## POST /estimates/options/decline — Decline Estimate Option

```
POST https://api.housecallpro.com/estimates/options/decline
```

Declines an estimate option (added Nov 2025).

---

## PUT /estimates/{estimate_id}/options/{option_id}/line_items/bulk_update — Bulk Update Option Line Items

```
PUT https://api.housecallpro.com/estimates/{estimate_id}/options/{option_id}/line_items/bulk_update
```

Bulk update estimate option line items (added Jan 2026).

---

## GET /estimates/{estimate_id}/line_items — List Estimate Line Items

```
GET https://api.housecallpro.com/estimates/{estimate_id}/line_items
```

List all line items across all options (added Dec 2025).
