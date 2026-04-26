# HCP API — Other Resources

## Checklists

| Method | Path | Description |
|--------|------|-------------|
| GET | `/checklists` | List checklists |

Job checklists configured in HCP.

---

## Materials

| Method | Path | Description |
|--------|------|-------------|
| GET | `/materials` | List materials |

### Material Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/material_categories` | List material categories |

---

## Price Forms

| Method | Path | Description |
|--------|------|-------------|
| GET | `/price_forms` | List custom pricing forms |

---

## Price Book Services

| Method | Path | Description |
|--------|------|-------------|
| GET | `/price_book_services` | List service catalog items |

HCP has a separate **Pricebook API** with additional endpoints for managing the price book catalog.

---

## Service Zones

| Method | Path | Description |
|--------|------|-------------|
| GET | `/service_zones` | List geographic service areas |

---

## Pipeline

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pipeline` | Sales pipeline stages |

---

## Lead Sources

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lead_sources` | List where leads come from |

---

## Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tags` | List all tags |
| POST | `/tags` | Create a tag |

---

## Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List events/activities |

---

## Webhooks

HCP supports webhooks for real-time event notifications.

### Webhook Events

| Event | Description |
|-------|-------------|
| `job.created` | New job created |
| `job.scheduled` | Job scheduled |
| `job.started` | Job started (on my way / in progress) |
| `job.completed` | Job completed |
| `job.canceled` | Job canceled |
| `job.deleted` | Job deleted |
| `job.paid` | Job paid |
| `estimate.created` | Estimate created |
| `estimate.scheduled` | Estimate scheduled |
| `estimate.completed` | Estimate completed |
| `estimate.won` | Estimate accepted |
| `customer.created` | Customer created |
| `customer.updated` | Customer updated |

Webhooks require a signing secret for payload verification.

### Webhook Payload Format

```json
{
  "event": "job.completed",
  "data": {
    "id": "job_id",
    ...full job/estimate/customer object
  },
  "timestamp": "2024-01-15T12:00:00Z"
}
```
