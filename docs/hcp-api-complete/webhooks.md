# HCP API — Webhooks (Complete)

> From https://docs.housecallpro.com/docs/housecall-public-api/46e9e1be07621-webhooks

---

## Overview

HCP supports webhooks for real-time notifications when resources change. Webhook events are sent as HTTP POST requests to your configured URL.

All webhook payloads include `event_created_at` (added Nov 2025).

---

## Webhook Event Types

### Job Events
| Event | Description |
|-------|-------------|
| `job.created` | New job created |
| `job.scheduled` | Job scheduled |
| `job.dispatched` | Job dispatched to tech |
| `job.on_my_way` | Tech is on the way |
| `job.started` | Work started |
| `job.completed` | Job completed |
| `job.canceled` | Job canceled |
| `job.deleted` | Job deleted |
| `job.updated` | Job updated |

### Estimate Events
| Event | Description |
|-------|-------------|
| `estimate.created` | New estimate created |
| `estimate.sent` | Estimate sent to customer |
| `estimate.approved` | Customer approved estimate |
| `estimate.declined` | Customer declined estimate |
| `estimate.updated` | Estimate updated |

### Customer Events
| Event | Description |
|-------|-------------|
| `customer.created` | New customer created |
| `customer.updated` | Customer updated |

### Lead Events
| Event | Description |
|-------|-------------|
| `lead.created` | New lead created |
| `lead.updated` | Lead updated |
| `lead.deleted` | Lead deleted |

### Invoice Events
| Event | Description |
|-------|-------------|
| `invoice.created` | Invoice created |
| `invoice.sent` | Invoice sent |
| `invoice.paid` | Invoice paid |
| `invoice.updated` | Invoice updated |

Invoice webhooks include `job_id` (added Jan 2026).

---

## Webhook Payload Structure

```json
{
  "event": "job.completed",
  "event_created_at": "2026-01-15T10:30:00Z",
  "data": {
    // Full resource object (same as GET response)
  }
}
```

### Job Webhook Additions (Mar 2026)
- `canceled_at`: ISO8601 UTC when user canceled; `null` otherwise
- `deleted_at`: ISO8601 UTC when pro canceled/deleted; `null` otherwise

### Lead Webhook Additions (Mar 2026)
- `lost_at`: ISO8601 UTC when marked lost; `null` otherwise

---

## Webhook Configuration

Webhooks are configured via the HCP API:

### POST /webhooks — Create Webhook
```
POST https://api.housecallpro.com/webhooks
```

### GET /webhooks — List Webhooks
```
GET https://api.housecallpro.com/webhooks
```

---

## Webhook Security

Use the `HCP_WEBHOOK_SECRET` to verify webhook signatures. Validate the `X-HCP-Signature` header against the request body using HMAC-SHA256.

---

## Best Practices

1. Respond with 200 quickly (within 5s)
2. Process asynchronously
3. Handle duplicate events (idempotent processing)
4. Implement retry logic — HCP retries on non-2xx responses
