# HCP API — Invoices (Complete)

> All invoice endpoints from https://docs.housecallpro.com/docs/housecall-public-api

---

## GET /invoices — List Invoices

```
GET https://api.housecallpro.com/invoices
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Current page |
| `page_size` | number | 10 | Results per page |
| `sort_by` | string | — | Sort field (added Nov 2025) |
| `sort_direction` | string | — | `asc` or `desc` |

### Invoice Object
```json
{
  "id": "string",
  "invoice_number": "string",
  "job_id": "string",
  "customer": Customer,
  "status": "string",
  "subtotal": 0,
  "total": 0,
  "items": [{
    "id": "string",
    "name": "string",
    "description": "string",
    "quantity": 0,
    "unit_price": 0,
    "amount": 0
  }],
  "taxes": [{
    "id": "string",
    "name": "string",
    "rate": 0,
    "amount": 0
  }],
  "discounts": [{
    "id": "string",
    "name": "string",
    "amount": 0
  }],
  "payments": [{
    "id": "string",
    "amount": 0,
    "method": "string",
    "paid_at": "string"
  }],
  "created_at": "string",
  "updated_at": "string"
}
```

**Notes:**
- `id` field added to InvoiceItem, InvoiceTax, InvoiceDiscount, InvoicePayment (Nov 2025)
- `subtotal` added (Sep 2025)

---

## GET /invoices/{uuid} — Get Single Invoice

```
GET https://api.housecallpro.com/invoices/{uuid}
```

Retrieve individual invoice by UUID (added Sep 2025).

---

## GET /invoices/{uuid}/preview — Preview Invoice HTML

```
GET https://api.housecallpro.com/invoices/{uuid}/preview
```

Returns HTML preview of the invoice (added Sep 2025).

---

## GET /jobs/{job_id}/invoices — Get Job Invoices

```
GET https://api.housecallpro.com/jobs/{job_id}/invoices
```

List all invoices for a specific job (added May 2024).

### Response (200)
```json
{
  "invoices": [Invoice]
}
```
