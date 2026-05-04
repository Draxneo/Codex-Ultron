# HCP API — Pricebook (Complete)

> From https://docs.housecallpro.com/docs/housecall-public-api/p5zsg5n9sbiij-pricebook-api

---

## Overview

The Pricebook API provides access to services, materials, material categories, and price forms configured in your HCP account.

---

## Price Book Services

### GET /pricebook/services — List Services
```
GET https://api.housecallpro.com/pricebook/services
```

Returns configured pricebook services. Added Dec 2025.

---

## Materials

### GET /materials — List Materials
```
GET https://api.housecallpro.com/materials
```

Returns pricebook materials. Added Oct 2024.

---

## Material Categories

### GET /material_categories — List Material Categories
```
GET https://api.housecallpro.com/material_categories
```

Returns material category groupings.

---

## Price Forms

### GET /price_forms — List Price Forms
```
GET https://api.housecallpro.com/price_forms
```

Returns configured price forms/templates.

---

## Line Item Types

When adding line items to jobs, estimates, or leads, the `service_item_type` field indicates the source:

| Type | Description |
|------|-------------|
| `market_place` | From HCP marketplace |
| `organizational` | Company's own custom item |
| `pricebook_material` | From pricebook materials catalog |

## Line Item Kind Values

| Kind | Description |
|------|-------------|
| `labor` | Labor charge |
| `materials` | Material/part charge |
| `fixed gratuity` | Fixed tip/gratuity |
| `fixed discount` | Fixed dollar discount |
| `percent discount` | Percentage discount |

**Note:** `tax` kind is NOT accepted (despite appearing in some older docs). Use `percent discount` for tax-related adjustments.
