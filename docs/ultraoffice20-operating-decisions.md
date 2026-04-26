# UltraOffice2.0 Operating Decisions

This file tracks product and architecture decisions for the UltraOffice2.0 rebuild.

## Current Product Direction

UltraOffice2.0 is moving from an HCP-centered overlay toward a standalone operating system for the business.

During the transition, HCP remains useful as:

- an import/source-history system
- a fallback reference for old attachments and records
- a temporary comparison point while UltraOffice2.0 proves daily operations

The long-term goal is for UltraOffice2.0 to own customers, jobs, estimates, communications, payments, catalog/pricing, technician work, and operational follow-up.

## Workflow Engine

Status: legacy/experimental.

The current workflow engine attempted to model each job or estimate as a rigid step-by-step checklist. That was useful as an experiment, but it is probably not the right long-term shape for real HVAC operations. Service work has too many exceptions: call notes, delays, photos, missing parts, customer replies, unpaid invoices, open estimates, and technician follow-up all create outstanding work that does not fit neatly into one universal sequence.

Preferred future direction:

- Keep the existing workflow pages available while testing.
- Avoid large new investments in the old workflow engine.
- Build an AI-driven outstanding-items layer instead.
- Let the agent inspect jobs, estimates, calls, SMS, invoices, photos, agreements, and catalog/cart state.
- Have it produce a live list of what is unresolved, who owns it, and what action should happen next.

This should feel more like mission control than a strict checklist.

## Cleanup Priorities

1. Preserve and stabilize communications first: phone, SMS, call log, IVR, call routing, and softphone.
2. Centralize repeated utilities so the app stops rebuilding the same rules in many files.
3. Keep HCP import/sync working while staging proves it can operate without HCP as the center.
4. Rebuild unfinished experiments from scratch only when needed: Stripe webhooks, portals, cart/payment flows, and workflow automation.
5. Treat the current workflow engine as a reference, not a foundation.

## AI Outstanding Items Concept

The future AI tracker should answer questions like:

- Which jobs need a customer response?
- Which estimates are stale or missing follow-up?
- Which completed jobs still need invoice/payment/review action?
- Which jobs are missing photos, serial numbers, equipment info, or attachments?
- Which calls or texts imply a job should be created?
- Which customer promise is still unresolved?

The data should come from shared database helpers, not one-off page queries.
