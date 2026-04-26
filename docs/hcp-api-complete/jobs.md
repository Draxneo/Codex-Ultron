# HCP API — Jobs (Complete)

> All job endpoints from https://docs.housecallpro.com/docs/housecall-public-api

---

## GET /jobs — List Jobs

```
GET https://api.housecallpro.com/jobs
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Current page |
| `page_size` | number | 10 | Results per page (max 200) |
| `work_status[]` | array | — | Filter by status: `scheduled`, `in_progress`, `complete`, `incomplete`, `unscheduled`, `needs_scheduling`, `pro_canceled`, `user_canceled` |
| `employees[]` | array | — | Filter by assigned employee IDs |
| `scheduled_start_min` | string(date-time) | — | Min scheduled start |
| `scheduled_start_max` | string(date-time) | — | Max scheduled start |
| `scheduled_end_min` | string(date-time) | — | Min scheduled end |
| `scheduled_end_max` | string(date-time) | — | Max scheduled end |
| `completed_at_min` | string(date-time) | — | Min completed date |
| `completed_at_max` | string(date-time) | — | Max completed date |
| `customer_id` | string | — | Filter by customer |
| `sort_by` | string | `created_at` | Sort field |
| `sort_direction` | string | `desc` | `asc` or `desc` |
| `location_ids` | array | — | Filter by location |
| `expand` | array | — | `attachments`, `checklist`, `appointments` |

### Response (200)
```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 5,
  "total_items": 50,
  "jobs": [Job]
}
```

### Job Object

```json
{
  "id": "string",
  "invoice_number": "string",
  "description": "string",
  "customer": {
    "id": "string",
    "first_name": "string",
    "last_name": "string",
    "email": "string",
    "mobile_number": "string",
    "home_number": "string",
    "work_number": "string",
    "company": "string",
    "notifications_enabled": true,
    "tags": ["string"],
    "lead_source": "string"
  },
  "address": {
    "id": "string",
    "street": "string",
    "street_line_2": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string"
  },
  "note": "string",
  "work_status": "scheduled",
  "work_timestamps": {
    "on_my_way_at": "string",
    "started_at": "string",
    "completed_at": "string"
  },
  "schedule": {
    "scheduled_start": "string",
    "scheduled_end": "string",
    "arrival_window": {
      "start_time": "string",
      "end_time": "string"
    }
  },
  "assigned_employees": [Employee],
  "tags": [{"id": "string", "name": "string"}],
  "lead_source": "string",
  "job_fields": {},
  "total_amount": 0,
  "outstanding_balance": 0,
  "company_name": "string",
  "company_id": "string",
  "created_at": "string",
  "updated_at": "string",
  "canceled_at": "string|null",
  "deleted_at": "string|null",
  "recurrence_number": "integer|null",
  "recurrence_rule": "string|null",
  "appointments": [Appointment]
}
```

---

## POST /jobs — Create a Job

```
POST https://api.housecallpro.com/jobs
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
    "addresses": [{"city":"","state":"","street":"","street_line_2":"","zip":""}]
  },
  "address_id": "string",
  "address": {"city":"","state":"","street":"","street_line_2":"","zip":""},
  "description": "string",
  "assigned_employee_ids": ["string"],
  "schedule": {
    "scheduled_start": "2019-08-24T14:15:22Z",
    "scheduled_end": "2019-08-24T14:15:22Z",
    "arrival_window": {
      "start_time": "2019-08-24T14:15:22Z",
      "end_time": "2019-08-24T14:15:22Z"
    },
    "anytime": false
  },
  "line_items": [{
    "description": "string",
    "kind": "labor",
    "name": "string",
    "quantity": 1,
    "unit_cost": 0,
    "unit_price": 0
  }],
  "lead_source": "string",
  "note": "string",
  "tags": ["string"],
  "job_fields": {},
  "tax_name": "string",
  "tax_rate": 0
}
```

**Notes:**
- Either `customer_id` OR `customer` object required (not both)
- Either `address_id` OR `address` object for location
- `kind` values: `labor`, `materials`, `fixed discount`, `percent discount`
- `unit_price` and `unit_cost` are in **cents**
- `quantity` can be a float up to 2 decimal places
- Supports `anytime` schedule (no specific time window)

### Response (201)
Returns full Job object.

---

## GET /jobs/{id} — Get a Job

```
GET https://api.housecallpro.com/jobs/{id}
```

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `expand` | array | `attachments`, `checklist`, `appointments` |

### Response (200)
Returns full Job object.

---

## POST /jobs/{job_id}/attachments — Add Attachment

```
POST https://api.housecallpro.com/jobs/{job_id}/attachments
```

**BREAKING CHANGE (April 2024):** Now only accepts binary files from local machine.

Content-Type: `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | binary | Required. The file to attach |

### Response (200)
```json
{
  "id": "string",
  "download_url": "string",
  "created_at": "string"
}
```

---

## GET /jobs/{job_id}/line_items — List Line Items

```
GET https://api.housecallpro.com/jobs/{job_id}/line_items
```

### Response (200)
```json
{
  "line_items": [{
    "id": "string",
    "name": "string",
    "description": "string",
    "unit_price": 0,
    "unit_cost": 0,
    "unit_of_measure": "string",
    "quantity": 0,
    "kind": "labor",
    "taxable": true,
    "amount": 0,
    "order_index": 0,
    "service_item_id": "string",
    "service_item_type": "market_place"
  }]
}
```

---

## POST /jobs/{job_id}/line_items — Add Line Item

```
POST https://api.housecallpro.com/jobs/{job_id}/line_items
```

### Request Body
```json
{
  "name": "string",
  "description": "string",
  "unit_price": 0,
  "unit_cost": 0,
  "quantity": 1,
  "kind": "labor",
  "taxable": true,
  "service_item_id": "string",
  "service_item_type": "market_place"
}
```

**kind** values: `materials`, `labor`, `fixed gratuity`, `fixed discount`, `percent discount`

**service_item_type** values: `market_place`, `organizational`, `pricebook_material`

### Response (201)
Returns LineItem object.

---

## PUT /jobs/{job_id}/line_items/bulk_update — Bulk Update Line Items

```
PUT https://api.housecallpro.com/jobs/{job_id}/line_items/bulk_update
```

### Request Body
```json
{
  "line_items": [{
    "id": "string",
    "service_item_id": "string",
    "service_item_type": "market_place",
    "name": "string",
    "unit_price": 0,
    "unit_cost": 0,
    "quantity": 0,
    "kind": "labor",
    "taxable": true,
    "description": "string"
  }],
  "append_line_items": false
}
```

**Notes:**
- If `id` not provided for a line item, it's treated as a new line item
- If `append_line_items` is `false` (default), existing line items NOT in the request body will be deleted
- Supports `line_item.id` (preferred) or `line_item.uuid` for backwards compat

### Response (200)
```json
{
  "url": "string",
  "data": [LineItem]
}
```

---

## PUT /jobs/{job_id}/line_items/{id} — Update Single Line Item

```
PUT https://api.housecallpro.com/jobs/{job_id}/line_items/{id}
```

Same body as Add Line Item. Returns updated LineItem.

---

## DELETE /jobs/{job_id}/line_items/{id} — Delete Line Item

```
DELETE https://api.housecallpro.com/jobs/{job_id}/line_items/{id}
```

Returns 200 OK.

---

## PUT /jobs/{job_id}/schedule — Update Job Schedule

```
PUT https://api.housecallpro.com/jobs/{job_id}/schedule
```

### Request Body
```json
{
  "scheduled_start": "2019-08-24T14:15:22Z",
  "scheduled_end": "2019-08-24T14:15:22Z",
  "arrival_window": {
    "start_time": "2019-08-24T14:15:22Z",
    "end_time": "2019-08-24T14:15:22Z"
  },
  "anytime": false
}
```

---

## DELETE /jobs/{job_id}/schedule — Delete Job Schedule

```
DELETE https://api.housecallpro.com/jobs/{job_id}/schedule
```

Returns 200 OK.

---

## PUT /jobs/{job_id}/dispatch — Dispatch Job

```
PUT https://api.housecallpro.com/jobs/{job_id}/dispatch
```

### Request Body
```json
{
  "employee_ids": ["string"]
}
```

### Response (200)
Returns dispatched employee info.

---

## GET /jobs/{job_id}/input_materials — List Job Input Materials

```
GET https://api.housecallpro.com/jobs/{job_id}/input_materials
```

Returns list of input materials for the job.

---

## PUT /jobs/{job_id}/input_materials/bulk_update — Bulk Update Input Materials

```
PUT https://api.housecallpro.com/jobs/{job_id}/input_materials/bulk_update
```

---

## POST /jobs/{job_id}/tags — Add Job Tag

```
POST https://api.housecallpro.com/jobs/{job_id}/tags
```

### Request Body
```json
{
  "tag_id": "string"
}
```

### Response (200)
```json
{
  "tags": [{"id": "string", "name": "string"}]
}
```

---

## DELETE /jobs/{job_id}/tags/{tag_id} — Remove Job Tag

```
DELETE https://api.housecallpro.com/jobs/{job_id}/tags/{tag_id}
```

---

## POST /jobs/{job_id}/notes — Add Job Note

```
POST https://api.housecallpro.com/jobs/{job_id}/notes
```

### Request Body
```json
{
  "content": "string"
}
```

### Response (201)
```json
{
  "id": "string",
  "content": "string"
}
```

---

## DELETE /jobs/{job_id}/notes/{note_id} — Delete Job Note

```
DELETE https://api.housecallpro.com/jobs/{job_id}/notes/{note_id}
```

---

## POST /jobs/{job_id}/link — Create Job Link

```
POST https://api.housecallpro.com/jobs/{job_id}/link
```

Creates a shareable link for the job.

---

## POST /jobs/{job_id}/lock — Lock Job

```
POST https://api.housecallpro.com/jobs/{job_id}/lock
```

Locks a single job by ID.

### Response (200)
```json
{
  "id": "string",
  "locked_at": "2019-08-24T14:15:22Z"
}
```

---

## POST /jobs/lock — Lock Jobs (Bulk)

```
POST https://api.housecallpro.com/jobs/lock
```

Lock `completed` or `scheduled` jobs by time range.

### Request Body
```json
{
  "starting_at": "2019-08-24T14:15:22Z",
  "ending_at": "2019-08-24T14:15:22Z"
}
```

### Response (200)
```json
{
  "jobs": [{"id": "string", "locked_at": "2019-08-24T14:15:22Z"}]
}
```

---

## Work Status Values

| Status | Description |
|--------|-------------|
| `scheduled` | Job is scheduled |
| `in_progress` | Work has started |
| `complete` | Job completed |
| `incomplete` | Job not fully completed |
| `unscheduled` | No schedule set |
| `needs_scheduling` | Needs to be scheduled |
| `pro_canceled` | Canceled by pro |
| `user_canceled` | Canceled by customer |
