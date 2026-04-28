# Technician Workflow Roadmap

This is the working guide for the UltraOffice2.0 field workflow.

## Goal

Technicians should be able to run the visit from a phone:

1. Open assigned job.
2. Take photos.
3. Talk naturally to JARVIS.
4. Review JARVIS repair/cart suggestions.
5. Send a secure customer quote/cart link by SMS.
6. Customer approves, pays, finances, or asks for help.

Customer-facing actions stay human-approved.

## Current Foundation

- Assigned tech jobs appear in the tech schedule as mobile cards.
- Tech job detail has a simple Photos / Talk / Cart flow.
- Photos attach to the job and use the shared media renderer.
- JARVIS voice notes can suggest cart items, but tech approval is required.
- Job carts use secure public tokens.
- Sending the cart uses the centralized SMS path.
- Cart send now blocks when the customer phone is missing.
- Public cart page already supports customer review and payment paths.
- Comfort Club tags and service agreement data exist, but discount rules still need a clean central pricing service.

## Must-Have Rules

- Do not lose photos if AI fails.
- Do not lose tech voice transcripts if AI fails.
- JARVIS may suggest, but may not send, charge, or finalize pricing without approval.
- Final totals must be calculated server-side.
- Public quote/cart pages must not expose internal notes, AI reasoning, or other customers' data.
- Financing and Comfort Club language must come from central settings/config, not scattered hardcoded copy.

## Status By Priority

1. Technician job card flow: Mostly built. Needs final phone-size QA.
2. Customer/SMS/job actions: Built in pieces. Needs one clean tech action row and dispatch contact confirmation.
3. Photo attachment to job/customer record: Built. Needs selected customer-visible photo flag refinement.
4. Voice transcript capture tied to job: Added via `job_transcripts`.
5. AI draft repair cart: First pass built by parsing priced JARVIS suggestions.
6. Technician review/approval: First pass built. Needs edit/reprice speed polish.
7. Secure public quote URL: Built on `job_carts.public_token`.
8. Comfort Club discount/upsell: Data exists. Needs central pricing/eligibility service.
9. Financing/cash options: UI exists. Needs central configurable offer settings and server-side totals.
10. Polish: Ongoing.

## Recommended Next Build Pass

1. Create a single server-side cart pricing function/RPC.
2. Add central financing and discount settings.
3. Add Comfort Club eligibility and upsell block inside the tech cart.
4. Add quote events for viewed, accepted, declined, SMS sent, and payment started.
5. Add a tech-only manual test page/checklist for the complete field flow.
