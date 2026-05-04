# HCP API — Other Resources (Complete)

> Tags, checklists, job types, service zones, pipeline, events

---

## Tags

### GET /tags — List Tags
```
GET https://api.housecallpro.com/tags
```

Returns all tags configured in the account.

### Tag Object
```json
{
  "id": "string",
  "name": "string"
}
```

Tags can be added/removed from jobs, customers, and leads.

---

## Checklists

Checklists are accessible via the `expand=checklist` parameter on job endpoints.

---

## Job Types

### GET /job_types — List Job Types
```
GET https://api.housecallpro.com/job_types
```

### POST /job_types — Create Job Type
```
POST https://api.housecallpro.com/job_types
```

### PUT /job_types/{id} — Update Job Type
```
PUT https://api.housecallpro.com/job_types/{id}
```

Job Types support custom fields via `job_fields`. Added April 2023.

---

## Job Appointments

Multi-day jobs expose appointments via `expand=appointments` on GET /jobs and GET /jobs/{id}.

### Appointment Object
```json
{
  "id": "string",
  "scheduled_start": "string",
  "scheduled_end": "string",
  "status": "string"
}
```

Added Jul 2023.

---

## Service Zones

### GET /service_zones — List Service Zones
```
GET https://api.housecallpro.com/service_zones
```

Returns configured service zone boundaries. Added Jan 2026.

---

## Pipeline

### GET /pipeline/statuses — List Pipeline Statuses
```
GET https://api.housecallpro.com/pipeline/statuses
```

Returns available pipeline statuses for leads, jobs, and estimates. Added Feb 2026.

### Updating Pipeline Status

Pipeline status can be updated on:
- Leads
- Jobs
- Estimates

Added Feb 2026.

---

## Schedule Windows

### GET /schedule — Schedule Windows
```
GET https://api.housecallpro.com/schedule
```

Returns company availability windows for scheduling.
