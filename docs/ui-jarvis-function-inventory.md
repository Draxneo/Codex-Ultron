# UltraOffice2.0 UI, JARVIS, and Function Inventory

Last updated: 2026-04-27

Purpose: one cleanup map for buttons, JARVIS actions, and Supabase Edge Functions so old deployed functions can be retired safely.

## Current Rule

- GitHub repo is the source of truth for app code.
- Supabase project is the live runtime.
- Any deployed Supabase function not present in `supabase/functions` is legacy until restored or retired.
- Do not delete a remote-only function if current code, provider webhooks, or external links still call it.

## Main UI Button Map

| Area | Button/control | Current wiring | Intended behavior | Notes |
|---|---|---|---|---|
| Top nav | Schedule, Inbox, Customers, Vendors, JARVIS, Pay, Admin, Quick Quote | `AppHeader` links from `allNavItems` | Primary app navigation | Looks wired. `/sms`, `/calls`, `/phone` are legacy redirects. |
| Top nav tools | Phone, tools grid, status, theme, settings, logout | `SoftphoneStrip`, `AdminToolsGrid`, status/theme/auth handlers | Global utilities | Looks wired. |
| Admin tools grid | JARVIS, Catalog, IVR Builder, Call Routing, AI Agents, Leads, Vendors, Payments, Agreements, Quick Quote, Training, SMS Templates | Links from `adminNavigation.ts` | Opens admin/tool pages | SMS Templates points to `/agent-training?section=output`; confirm page honors query. |
| Admin hub quick actions | New Job, New Customer, Estimates, Calls, SMS | Links/query params | Fast operational actions | Calls/SMS intentionally redirect into Inbox. |
| Phone strip | Answer, decline, mute, keypad, speaker, hang up, dial, reconnect | `useSoftphone`, Electron/native helpers | Real phone controls | Looks wired; speaker only appears when native audio route exists. |
| Inbox/SMS | Mark all read, tabs, search, new message, thread actions, send, attach, templates, dictate | Supabase table updates, storage upload, `useSendSms` | SMS/call/voicemail command center | Attachment label says image but accepts more media types. |
| Job action bar | Schedule | No handler found | Should open scheduling/date controls | Needs fix. |
| Job action bar | OMW, Start, Finish | `sendOnMyWay`, `startJob`, `finishJob` | Job lifecycle actions | Looks wired. |
| Job action bar | Invoice, Pay | Both call `onInvoiceClick` | Scroll/open billing panel | Pay does not have distinct payment behavior yet. |
| Job action bar | Quick Quote | Navigate to `/quick-quote?...` | Build/send job quote | Looks wired. |
| Estimate detail | Schedule, Build Quote, Send, Convert/View Job, Proposal, Print | Navigation, `handleConvert`, public proposal, print | Estimate lifecycle | Convert may overpromise if job creation is not completed by trigger. |
| Cart/internal job | Add Items, Send, copy/open link, curate, remove item | Cart hooks/mutations | Build/send customer cart | Picker “Send” opens drawer, not immediate send. |
| Public cart | Pay Now, Apply Financing, Pay Cash, Approve Scope | `cart-checkout` | Customer checkout/approval | Depends on `cart-checkout`, which is local but not deployed yet. |
| IVR builder | Test mode, add department, save canvas, edit audio/SMS/routing | IVR hooks and storage upload | IVR source-of-truth editor | Canvas save includes a no-op config update; likely harmless but should be cleaned. |
| JARVIS page | Attention cards, active caller profile, mobile chat | Routes, side panel state | Dispatch assistant and queue view | Looks wired. |
| JARVIS action cards | Draft, send, call/text, accept, dismiss, train | `draft-sms-reply`, `send-sms`, softphone, direct table updates | Human-in-the-loop action queue | Call/Text currently accepts/closes after launching action, which may be too aggressive. |

## JARVIS Surfaces

| Surface | Main calls | Data touched | Execution style |
|---|---|---|---|
| Daily briefing | `ai-task-agent` mode `briefing` | Reads jobs, customers, SMS, calls, activity, training/knowledge | Auto read-only |
| Chat and quick questions | `ai-task-agent` mode `chat` | Reads broad context, writes chat session/messages | User-initiated; mutating actions should queue approval |
| Context builder | `jarvis-context-builder`, then `ai-task-agent` | Calls/SMS/customer/job context | Auto read-only |
| Suggested next steps | `jarvis-suggest-actions` | Reads customer/job context, logs button clicks | User click required |
| Action review queue | Direct Supabase plus sometimes `ai-task-agent` approved action replay | `action_items`, `activity_log` | Human-in-the-loop |
| Pending SMS | `send-sms` through `useSendSms` | `outbound_drafts`, `sms_log`, `action_items` | Human-in-the-loop send |
| Tech JARVIS | `tech-form-chat`, `ai-task-agent`, `extract-form-from-voice` | Job/equipment/training context | Tech-initiated |

## JARVIS Drift To Fix

| Issue | Why it matters | Recommendation |
|---|---|---|
| In-app email tools were retired | User moved to a standalone email client | Keep CRM email address fields, but do not send/read email inside UltraOffice. |
| `create_job` can double-gate approvals | User may approve JARVIS action, then approve appointment again | Collapse to one approval flow. |
| `create_todo` / `complete_todo` are deprecated no-ops | Old workflow/todo system still appears in tool list | Remove from always-on tools and registry. |
| Tool registry lists stale tools | Admin page can imply actions that do not exist | Reconcile registry to real `ai-task-agent` tools. |
| `send-sms` can auto-send some non-manual sources | Conflicts with “JARVIS customer-facing SMS needs approval” | Route AI/customer-facing drafts through approval unless explicitly exempted. |
| `send-sms` writes action item status `resolved` | Current status model is `pending`, `accepted`, `dismissed` | Normalize statuses to prevent hidden queue bugs. |

## Remote-Only Supabase Functions

These functions are deployed in Supabase but are not present in the local `supabase/functions` folder.

| Function | Current references | Recommendation | Risk |
|---|---|---|---|
| `email-send` | Retired; refs removed from current app/functions | Delete remote | Low |
| `email-agent` | Retired; maintenance report step now marks ready for standalone email client | Delete remote | Low |
| `send-brochure-email` | Retired; JARVIS email brochure tool removed | Delete remote | Low |
| `send-rebate-email` | Retired; CPS rebate generation now returns HTML for standalone submission | Delete remote | Low |
| `email-inbound-webhook` | Retired with in-app email | Delete remote after provider webhook check | Low |
| `sendgrid-event-webhook` | Retired with in-app email | Delete remote after provider webhook check | Low |
| `auto-follow-up-text` | Old migration removes cron usage | Delete candidate after final check | Low |
| `communications-agent` | Comments say folded into `ai-task-agent` | Delete candidate | Low |
| `follow-up-check-in` | No local refs found | Delete candidate | Low |
| `follow-up-inquiry` | No local refs found | Delete candidate | Low |
| `sales-docs-agent` | Comments say folded into `ai-task-agent` | Delete candidate | Low |
| `scheduling-agent` | Comments/old seed only | Delete candidate | Low-Medium |
| `send-completion-summary` | Old migration removes cron usage | Delete candidate | Low |
| `send-finance-notice` | Old migration removes cron usage | Delete candidate | Low |
| `send-review-request` | Old migration removes cron usage | Delete candidate | Low |

## Local-Only Functions Not Deployed

These exist locally but are not deployed in Supabase.

After deploying the current app/JARVIS/cart/phone helpers, the only remaining local-only functions are one-off migration/backfill helpers:

- `backfill-attachments`
- `backfill-call-notes-hcp`
- `backfill-install-agreements`
- `backfill-sms-contacts`

Keep these local until needed; deploy only for a deliberate backfill run.

Recently aligned/deployed from local repo:

- Cart/customer checkout: `cart-checkout`, `cart-send-receipt`, `cart-recovery-cron`
- JARVIS/context/scheduling: `jarvis-context-builder`, `suggest-schedule-slots`, `smart-scheduler`
- Phone/debug: `twilio-call-inspect`, `twilio-sms-inspect`, `voice-amd-callback`, `silence-watcher`
- HCP/import helpers still referenced by current code: `create-hcp-job`, `sync-hcp-customers`, `sync-job-to-hcp`, `upload-to-hcp`, `push-job-note-hcp`
- LSA/helpers: `sync-lsa-leads`, `update-lsa-lead-status`, `daily-lsa-booked-report`
- Operational helpers: `finalize-job`, `quick-quote-auto-create`, `retry-queue-processor`, `draft-rain-day-sms`, `send-tech-day-digest`, `generate-install-quote`, `generate-cps-rebate`, `lookup-jurisdiction`, `prewarm-route-cache`, `fetch-weather-forecast`

## Active Cron Check

Current active database cron jobs:

- `snapshot_daily_weather_to_jobs()`
- `cleanup_operational_logs()`

No active cron job was found calling the old remote-only follow-up/review/finance functions.

## Safe Cleanup Order

1. Deploy the email-retirement function updates.
2. Delete retired email remote functions after confirming no external provider webhook still points at them.
3. Reconcile JARVIS tool registry with actual `ai-task-agent` tools.
4. Remove deprecated todo/workflow tools from JARVIS.
5. Delete low-risk remote-only legacy functions.
