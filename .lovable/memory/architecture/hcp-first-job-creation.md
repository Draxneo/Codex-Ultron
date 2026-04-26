---
name: HCP-First Job Creation
description: All job/estimate creation flows POST to HCP API first; local records created only via webhook.
type: feature
---
## HCP-First Architecture
All booking/creation flows (JARVIS action cards, CSR intake, Book It Now popups) call `create-hcp-job` edge function which:
1. Resolves/creates HCP customer
2. POSTs job or estimate to HCP API
3. Sets schedule and dispatch on HCP
4. Pushes AI-summarized context note
5. Does NOT insert locally — waits for HCP webhook

The `hcp-webhook` function creates the local record and calls `finalize-job` with `skip_hcp: true` for side effects (chat channel, line items, workflow, activity log).

**No local-first inserts for jobs/estimates.** HCP is always the source of truth for creation.

Frontend components using this: `ActionItemCards`, `BookingIntentAlert`, `IntakeActionCards`.
