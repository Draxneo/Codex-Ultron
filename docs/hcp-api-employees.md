# HCP API — Employees & Schedule

## GET /employees — List Employees

```
GET https://api.housecallpro.com/employees
```

**Response:**
```json
{
  "employees": [{
    "id": "string",
    "first_name": "string",
    "last_name": "string",
    "email": "string",
    "mobile_number": "string",
    "color_hex": "string",
    "avatar_url": "string",
    "role": "string",
    "tags": ["string"]
  }],
  "total_items": 6,
  "total_pages": 1
}
```

### Employee Roles

Common roles: `admin`, `field tech`, `office staff`

---

## Schedule Windows

```
GET https://api.housecallpro.com/schedule
```

Returns company schedule/availability windows.

---

## Routes

```
GET https://api.housecallpro.com/routes
```

Returns routing/dispatch information for the company.

---

## Company

```
GET https://api.housecallpro.com/company
```

Returns company settings and information.

---

## Application

```
GET https://api.housecallpro.com/application
```

Returns app/integration info for the current API key.
