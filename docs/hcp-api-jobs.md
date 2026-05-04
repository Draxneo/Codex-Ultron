# HCP API — Jobs

## GET /jobs — List Jobs

```
GET https://api.housecallpro.com/jobs
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number |
| `page_size` | integer | Results per page (max 200) |
| `work_status[]` | string | Filter by status (repeatable). Values: `needs scheduling`, `scheduled`, `in progress`, `complete unrated`, `complete rated`, `user canceled`, `pro canceled` |
| `scheduled_start_min` | ISO 8601 | Jobs scheduled after this date |
| `scheduled_start_max` | ISO 8601 | Jobs scheduled before this date |
| `sort_direction` | string | `asc` or `desc` |
| `expand[]` | string | Expand nested objects: `appointments` |
| `location_ids` | array | Filter by location IDs |

**Response:**
```json
{
  "jobs": [ ...Job objects... ],
  "page": 1,
  "page_size": 10,
  "total_items": 50,
  "total_pages": 5
}
```

---

## GET /jobs/{id} — Get a Single Job

```
GET https://api.housecallpro.com/jobs/{id}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID (path, required) |
| `expand[]` | string | `attachments`, `appointments` |

---

## POST /jobs — Create a Job

```
POST https://api.housecallpro.com/jobs
```

**Request Body:**
```json
{
  "customer_id": "string",
  "address_id": "string",
  "description": "string",
  "lead_source": "string",
  "tags": ["string"],
  "note": "string"
}
```

---

## Job Sub-Resources

### Attachments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/{id}/attachments` | Add attachment to job |

### Line Items
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs/{id}/line_items` | List line items |
| POST | `/jobs/{id}/line_items` | Add line item |
| PUT | `/jobs/{id}/line_items` | Bulk update line items |
| PUT | `/jobs/{id}/line_items/{item_id}` | Update single line item |
| DELETE | `/jobs/{id}/line_items/{item_id}` | Delete single line item |

### Schedule
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/jobs/{id}/schedule` | Update job schedule |
| DELETE | `/jobs/{id}/schedule` | Delete job schedule |

### Dispatch
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/jobs/{id}/dispatch` | Dispatch job to employees |

### Input Materials
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs/{id}/input_materials` | List input materials |
| PUT | `/jobs/{id}/input_materials` | Bulk update input materials |

### Tags
| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/{id}/tags` | Add tag to job |
| DELETE | `/jobs/{id}/tags` | Remove tag from job |

### Notes
| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/{id}/notes` | Add note to job |
| DELETE | `/jobs/{id}/notes/{note_id}` | Delete note |

### Links
| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/{id}/links` | Create job link |

---

## Job Object Schema

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
    "lead_source": "string",
    "notes": "string",
    "created_at": "string",
    "updated_at": "string",
    "company_name": "string",
    "company_id": "string",
    "tags": ["string"],
    "addresses": [{ ...Address }]
  },
  "address": {
    "id": "string",
    "type": "string",
    "street": "string",
    "street_line_2": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string",
    "latitude": "string",
    "longitude": "string"
  },
  "note": "string",
  "work_status": "string",
  "outstanding_balance": 0,
  "total_amount": 0,
  "tags": ["string"],
  "assigned_employees": [{ ...Employee }],
  "schedule": {
    "scheduled_start": "2024-01-15T09:00:00Z",
    "scheduled_end": "2024-01-15T12:00:00Z",
    "arrival_window": 60,
    "appointments": [{
      "id": "string",
      "start_time": "2024-01-15T09:00:00Z",
      "end_time": "2024-01-15T12:00:00Z",
      "arrival_window_minutes": 60,
      "dispatched_employees_ids": ["string"]
    }]
  },
  "work_timestamps": {
    "on_my_way_at": "2024-01-15T08:45:00Z",
    "started_at": "2024-01-15T09:05:00Z",
    "completed_at": "2024-01-15T11:30:00Z"
  },
  "customer_id": "string",
  "lead_source": "string",
  "created_at": "string",
  "updated_at": "string"
}
```

### Work Status Values

| Status | Description |
|--------|-------------|
| `needs scheduling` | Job created but not scheduled |
| `scheduled` | Job has been scheduled |
| `in progress` | Job is currently being worked |
| `complete unrated` | Job completed, not yet rated |
| `complete rated` | Job completed and rated |
| `user canceled` | Canceled by customer |
| `pro canceled` | Canceled by pro/company |

---

## GET /job_appointments — List Job Appointments

```
GET https://api.housecallpro.com/job_appointments
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number |
| `page_size` | integer | Results per page |

---

## GET /job_types — List Job Types

```
GET https://api.housecallpro.com/job_types
```

Returns all configured job types for the company.
