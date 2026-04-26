# HCP API — Authentication

> Source: https://docs.housecallpro.com/docs/housecall-public-api/b87d37ae48a0d-authentication

## Authentication Methods

### 1. API Key (Company API Key)
```
Authorization: Token <your_api_key>
```
- Generated at: HCP → Settings → API Keys
- Only Admin users can generate keys
- Requires **MAX or XL plan**

### 2. API Key (Application API Key)
For integration partners building apps for multiple HCP companies.

### 3. OAuth 2.0
```
Authorization: Bearer <access_token>
```
- Standard OAuth 2.0 flow for third-party integrations
- Tokens expire — refresh using documented OAuth flow
- If access token is expired, API returns 401

## Multi-Location Support

For companies with multiple locations:
```
X-Company-Id: <company_id>
```
When set, `location_ids` query parameters are ignored.

**Multi-location enabled APIs:** All list endpoints support `location_ids` parameter. When `X-Company-Id` header is set, data is scoped to that location.

## Pagination (all list endpoints)

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | integer | 1 | — | Page number (1-indexed) |
| `page_size` | integer | 10 | 200 | Results per page |

Response includes:
```json
{
  "page": 1,
  "page_size": 10,
  "total_items": 150,
  "total_pages": 15
}
```

## Rate Limits
No official limits documented. Community suggests ~150 req/min. Implement exponential backoff on 429.

## Error Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Unauthorized (bad/missing/expired token) |
| 404 | Resource not found |
| 410 | Gone (archived job) |
| 429 | Rate limited |
| 500+ | Server error |

## Contact
API support: apideveloper@housecallpro.com
