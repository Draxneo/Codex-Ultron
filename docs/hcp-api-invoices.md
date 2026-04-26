# HCP API — Invoices

## GET /invoices — List Invoices

```
GET https://api.housecallpro.com/invoices
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `page_size` | string | Results per page (default: 10) |
| `customer_uuid` | array | Filter by customer UUIDs |
| `amount_due_min` | number | Min amount due |
| `amount_due_max` | number | Max amount due |
| `created_at_min` | ISO 8601 | Created after this date |
| `created_at_max` | ISO 8601 | Created before this date |
| `due_at_min` | ISO 8601 | Due after this date |
| `due_at_max` | ISO 8601 | Due before this date |
| `paid_at_min` | ISO 8601 | Paid after this date |
| `paid_at_max` | ISO 8601 | Paid before this date |
| `payment_method` | array | Filter: `consumer_financing`, `credit_card`, `ach`, `external`, `mobile_check_deposit` |
| `status` | array | Filter: `open`, `pending_payment`, `paid`, `voided`, `uncollectible`, `canceled` |
| `sort_by` | string | `created_at` (default), `amount`, `due_amount`, `due_at`, `invoice_number`, `paid_at`, `sent_at`, `status`, `updated_at` |
| `sort_direction` | string | `asc` or `desc` (default) |
| `location_ids` | array | Filter by location IDs |

**Response:**
```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 5,
  "total_items": 50,
  "invoices": [{
    "id": "string",
    "status": "string",
    "invoice_number": "string",
    "amount": 0,
    "subtotal": 0,
    "due_amount": 0,
    "due_at": "string",
    "display_due_concept": "string",
    "due_concept": "string",
    "paid_at": "string",
    "sent_at": "string",
    "service_date": "string",
    "invoice_date": "string",
    "items": [{ ...InvoiceItem }],
    "taxes": [{ ...InvoiceTax }],
    "discounts": [{ ...InvoiceDiscount }],
    "payments": [{ ...InvoicePayment }],
    "job_id": "string"
  }]
}
```

### Invoice Status Values

| Status | Description |
|--------|-------------|
| `open` | Invoice created, not yet sent/paid |
| `pending_payment` | Sent, awaiting payment |
| `paid` | Fully paid |
| `voided` | Voided |
| `uncollectible` | Marked uncollectible |
| `canceled` | Canceled |
