# HCP API — Employees, Schedule, Company (Complete)

> Endpoints from https://docs.housecallpro.com/docs/housecall-public-api

---

## GET /employees — List Employees

```
GET https://api.housecallpro.com/employees
```

### Employee Object
```json
{
  "id": "string",
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "mobile_number": "string",
  "color_hex": "string",
  "avatar_url": "string",
  "role": "string",
  "created_at": "string",
  "tags": ["string"],
  "permissions": {
    "can_add_and_edit_job": true,
    "can_be_booked_online": true,
    "can_call_and_text_with_customers": true,
    "can_chat_with_customers": true,
    "can_delete_and_cancel_job": true,
    "can_edit_message_on_invoice": true,
    "can_see_street_view_data": true,
    "can_share_job": true,
    "can_take_payment_see_prices": true,
    "can_see_customers": true,
    "can_see_full_schedule": true,
    "can_see_future_jobs": true,
    "can_see_marketing_campaigns": true,
    "can_see_reporting": true,
    "can_edit_settings": true,
    "is_point_of_contact": true,
    "is_admin": true
  },
  "company_name": "string",
  "company_id": "string"
}
```

### Employee Roles
- `admin`
- `field tech`
- `office staff`

**Note:** `created_at` exposed Jan 2026.

---

## GET /schedule — Schedule Windows

```
GET https://api.housecallpro.com/schedule
```

Returns company schedule/availability windows.

---

## GET /company/schedule_availability/booking_windows — Booking Availability

```
GET https://api.housecallpro.com/company/schedule_availability/booking_windows
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `service_id` | string | Service ID for duration lookup |
| `service_duration` | integer | Duration in minutes (overrides service_id) |

**Duration resolution order:**
1. `service_duration` parameter (if provided)
2. Service's configured duration from Online Booking settings (if `service_id` provided)
3. 30-minute default (backward compat)

Added Feb 2026.

---

## GET /routes — Routes

```
GET https://api.housecallpro.com/routes
```

Returns routing/dispatch information.

---

## GET /company — Company Info

```
GET https://api.housecallpro.com/company
```

Returns company settings. Includes `franchise_info` for companies in a franchise org.

---

## PATCH /company/franchise_info — Update Franchise Info

```
PATCH https://api.housecallpro.com/company/franchise_info
```

### Request Body
```json
{
  "metadata": {
    "territory_management": {
      "franchise_id": "string"
    },
    "franchisee_identifier": "string",
    "external": {}
  }
}
```

**Note:** `franchise_ids` returned in responses (array), `franchise_id` used in requests (single). Added Mar 2026.

---

## GET /application — Application Info

```
GET https://api.housecallpro.com/application
```

Returns app/integration info for the current API key.

---

## GET /events — Events

```
GET https://api.housecallpro.com/events
```

Returns calendar/schedule events.
