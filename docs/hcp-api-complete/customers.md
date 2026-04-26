# HCP API — Customers (Complete)

> All customer endpoints from https://docs.housecallpro.com/docs/housecall-public-api

---

## GET /customers — List Customers

```
GET https://api.housecallpro.com/customers
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Current page |
| `page_size` | number | 10 | Results per page |
| `q` | string | — | Search by name, email, mobile number, address |
| `sort_by` | string | `created_at` | Sort field |
| `sort_direction` | string | `desc` | `asc` or `desc` |
| `location_ids` | array | — | Filter by location IDs |
| `expand` | array | — | `attachments`, `do_not_service` |

### Response (200)
```json
{
  "page": 0,
  "page_size": 0,
  "total_pages": 0,
  "total_items": 0,
  "customers": [Customer]
}
```

### Customer Object
```json
{
  "id": "string",
  "first_name": "string|null",
  "last_name": "string|null",
  "email": "string|null",
  "mobile_number": "string|null",
  "home_number": "string|null",
  "work_number": "string|null",
  "company": "string|null",
  "notifications_enabled": true,
  "lead_source": "string|null",
  "notes": "string|null",
  "created_at": "string",
  "updated_at": "string",
  "company_name": "string",
  "company_id": "string",
  "tags": ["string"],
  "addresses": [Address],
  "attachments": [Attachment],
  "do_not_service": false
}
```

---

## POST /customers — Create Customer

```
POST https://api.housecallpro.com/customers
```

### Request Body
```json
{
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
}
```

### Response (201)
Returns Customer object.

---

## GET /customers/{id} — Get Customer

```
GET https://api.housecallpro.com/customers/{id}
```

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `expand` | array | `attachments`, `do_not_service` |

### Response (200)
Returns Customer object.

---

## PUT /customers/{id} — Update Customer

```
PUT https://api.housecallpro.com/customers/{id}
```

### Request Body
Same as Create Customer (all fields optional).

### Response (200)
Returns updated Customer object.

---

## GET /customers/{customer_id}/addresses — Get All Addresses

```
GET https://api.housecallpro.com/customers/{customer_id}/addresses
```

### Response (200)
```json
{
  "addresses": [{
    "id": "string",
    "street": "string",
    "street_line_2": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string"
  }]
}
```

---

## POST /customers/{customer_id}/addresses — Create Address

```
POST https://api.housecallpro.com/customers/{customer_id}/addresses
```

### Request Body
```json
{
  "street": "string",
  "street_line_2": "string",
  "city": "string",
  "state": "string",
  "zip": "string"
}
```

### Response (201)
Returns Address object.

---

## GET /customers/{customer_id}/addresses/{address_id} — Get Address

```
GET https://api.housecallpro.com/customers/{customer_id}/addresses/{address_id}
```

### Response (200)
Returns Address object.

---

## Address Object
```json
{
  "id": "string",
  "street": "string",
  "street_line_2": "string",
  "city": "string",
  "state": "string",
  "zip": "string",
  "country": "string"
}
```
