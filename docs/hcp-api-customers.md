# HCP API — Customers

## GET /customers — List Customers

```
GET https://api.housecallpro.com/customers
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number |
| `page_size` | integer | Results per page |
| `q` | string | Search by name, email, phone |
| `location_ids` | array | Filter by location IDs |

**Response:**
```json
{
  "customers": [ ...Customer objects... ],
  "page": 1,
  "page_size": 10,
  "total_items": 100,
  "total_pages": 10
}
```

---

## GET /customers/{id} — Get a Customer

```
GET https://api.housecallpro.com/customers/{id}
```

---

## POST /customers — Create a Customer

```
POST https://api.housecallpro.com/customers
```

**Request Body:**
```json
{
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
  "tags": ["string"],
  "addresses": [{
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

## PUT /customers/{id} — Update a Customer

```
PUT https://api.housecallpro.com/customers/{id}
```

Same body fields as create (all optional).

---

## Customer Object Schema

```json
{
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
  "addresses": [{
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
  }]
}
```
