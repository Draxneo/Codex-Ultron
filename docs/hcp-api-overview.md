# HCP API — Overview & Authentication

## Base URL

```
https://api.housecallpro.com
```

**Important:** There is NO `/v1/` prefix in the URL path.

---

## Authentication

### API Key Auth (what we use)

```
Authorization: Token <your_api_key>
```

Example:
```
Authorization: Token 8da91a1114b64f61a7c981a370274773
```

### OAuth 2.0 (for integration partners)

```
Authorization: Bearer <access_token>
```

**Requirements:**
- API access requires the **MAX or XL plan**
- Only Admin users can generate API keys
- Keys generated at: HCP → Settings → API Keys

---

## Multi-Location Support

For companies with multiple locations, use the `X-Company-Id` header:
```
X-Company-Id: <company_id>
```

When set, `location_ids` query parameters are ignored.

---

## Pagination

All list endpoints support pagination:

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (1-indexed, default: 1) |
| `page_size` | integer | Results per page (default: 10, max: 200) |

Response includes:
```json
{
  "page": 1,
  "page_size": 10,
  "total_items": 150,
  "total_pages": 15
}
```

---

## Rate Limits

No official limits documented. Community suggests ~150 requests/minute. Implement exponential backoff on 429 responses.

---

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request / validation error |
| 401 | Unauthorized (bad/missing token) |
| 404 | Resource not found |
| 410 | Gone (archived job) |
| 429 | Rate limited |
| 500+ | Server error |

Error response format:
```json
{
  "error": {
    "message": "Description of what went wrong"
  }
}
```
