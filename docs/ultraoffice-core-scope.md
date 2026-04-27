# UltraOffice2.0 Core Scope

Last updated: 2026-04-27

Purpose: define the lean base app before adding new features back. Anything outside this list is retired, archived, or hidden unless it directly supports one of these workflows.

## Keep And Harden

| Core area | Must work | Notes |
|---|---|---|
| Phone, IVR, call routing | Inbound calls, business hours, after-hours/overflow, answering service fallback, call status, softphone, call logs | IVR canvas is the source of truth for routing and IVR-triggered SMS. |
| SMS/MMS | Test/live number webhooks, media viewer, templates, customer/tech conversations, outbound approvals | Customer-facing AI drafts stay human-in-the-loop unless explicitly exempted. |
| Dispatch schedule | Jobs assigned to techs, backlog, daily board, on-my-way/start/finish, ETA/weather | Tech assignment must drive tech schedule and reminders. |
| Tech app/forms | Tech sees assigned jobs, adds photos, fills simple forms, talks to JARVIS, sends repair/replacement options | Keep this simple and field-proof. |
| Customer/cart/proposals | Repair options, replacement estimates, customer approval, remembered cart, pay now/pay later, financing link path | This replaces old presentation-heavy sales flow over time. |
| Payments/invoicing | Stripe checkout, invoices, receipts, payment status, failed payment alerts | Email receipts are retired unless replaced by standalone email workflow; SMS/payment links stay core. |
| Customers/jobs/estimates | CRM, multiple properties, job notes, estimate approval/convert-to-job | Estimates and jobs should share one detail layout wherever possible. |
| Catalog/pricing/repairs/equipment | Repair catalog, equipment matchups, parts, pricebook | Needed for tech options and carts. |
| Weather/ETA/property data | Cached Google routes/ETA, weather alerts, property lookup guardrails | Guard API usage and log cost events. |
| Agreements | Service agreements and due visits | Keep if actively used for recurring revenue/visits. |
| Admin/system log | One backend dashboard for errors, traces, API usage, cron/heartbeat, phone debug, deployment health | One source of logs and monitors. |
| JARVIS | Dispatch assistant, SMS/call/voicemail understanding, human-approved actions, what's-next action items | No hidden auto-actions for customer-facing communications. |

## Retire Or Archive

| Area | Decision |
|---|---|
| In-app email client and email functions | Retired. Keep email addresses as contact fields only. |
| Sequence Builder / old workflow automation | Retired unless rebuilt later as simple action-item rules. |
| Presentation Design Studio | Retire in favor of cart/proposal flow unless a specific public proposal page is still needed. |
| Customer Portal | Retire for now unless it supports cart/payment links. |
| Agent Pipeline / Agent Network visualization | Retire from operator UI; keep only docs/inventory if useful. |
| Payment Flow canvas | Retire if Payments dashboard covers the job. |
| Customer Journey canvas | Retire; JARVIS action items become the workflow. |
| Old HCP-only helpers | Keep only until replacement data path exists, then remove. |

## Cleanup Rule

Before deleting a table or function:

1. Confirm no current route, hook, component, Supabase function, cron, webhook, or admin tool uses it.
2. If it is old data, export/archive before dropping.
3. Delete UI route/navigation first, then code, then deployed function, then database table.
4. Run build and a smoke test on phones/SMS/jobs/cart/admin after each cleanup chunk.
