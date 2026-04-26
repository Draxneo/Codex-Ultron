# Organize Plus — System Architecture & Dev Guide

## The Philosophy

**Customers get humans. Humans get JARVIS.**

The customer calls in and your dispatcher answers. Real voice, real person, real relationship. That's your brand — family business, San Antonio, we know your name. That never changes.

Behind that dispatcher, JARVIS is already pulling up the customer record, checking the address, looking at equipment history, watching the conversation, and quietly doing every piece of data work that used to eat 20 minutes of the dispatcher's day. The dispatcher isn't scrambling to find the last service date — JARVIS already has it. The dispatcher isn't typing the job into the system after the call — JARVIS already created it. The dispatcher isn't texting the tech — the machine already did it.

AI doesn't replace the human touch. It removes everything that was preventing the human from being fully human.

The machine handles the routine. JARVIS handles the exceptions. And nothing gets written until it's confirmed.

## The Human Building This
The owner is NOT a developer. He's an HVAC business owner building his own operations platform. That means:
- **Always suggest better approaches** — don't just do what's asked if there's a cleaner way
- **Explain trade-offs** in plain language when proposing architecture decisions
- **Proactively flag** when a change will break or drift from other parts of the system
- **Never assume** he'll remember to ask you to update related UI/functions/queries
- **He needs help thinking through system design** — brainstorm with him, challenge assumptions, propose alternatives. Apply the 6 Rules below.
- **He's learning as he goes** — when something is a bad pattern, explain WHY so he can make better requests next time

---

## The 6 Non-Negotiable Rules

### Architecture Rules (How the system is built)

1. **ONE WORKFLOW** — Every job flows through `useWorkflowStage`. Every AI action must advance a workflow timestamp or flag a blocker. Nothing happens outside the pipeline.
2. **ONE SOURCE OF TRUTH** — Supabase is the only database. No hardcoded business logic. The `agent_tools` table is the master registry. Everything readable by JARVIS.
3. **WHAT'S NEXT** — The system must always know the next step. JARVIS must always answer "what needs to happen right now?"

### Operational Rules (How JARVIS behaves)

4. **THE MACHINE RUNS ITSELF** — The workflow executes automatically. JARVIS does not run it. When steps are blocked, surface them with exactly what's missing. Never execute workflow steps. Never claim a step is done if the machine hasn't done it.
5. **RESPOND TO CONTEXT, NEVER INITIATE** — JARVIS acts when context tells him to: a human asks, a customer contacts us, a workflow alert fires. He never wakes up and decides to send a message or book something without a clear external trigger. When in doubt: surface a card, ask the human.
6. **VERIFY BEFORE YOU WRITE** — Before creating or updating any customer record: verify the address through Mapbox, fuzzy-match the name against existing customers. San Antonio has a large Hispanic population — check spelling variations (Rodriguez/Rodrigues, Garcia/Garsia) before assuming a new customer. If confidence is low, confirm first. When ambiguous, surface an `action_items` card. Never guess. Never write dirty data.

### How It Works in Practice

- **Phone call** → Dispatcher answers, talks naturally. JARVIS listens via transcript, extracts customer data, verifies address + name, creates/updates customer record, queues the job. Dispatcher approves with one tap.
- **SMS inbound** → Customer texts. JARVIS observes the human conversation, extracts intent, surfaces action cards. If booking intent detected, finds available slots, drafts A/B/C options for dispatcher to send.
- **Email inbound** → Same pattern. JARVIS classifies, extracts, verifies, surfaces cards. Human decides.
- **Low confidence** → JARVIS never guesses. Surfaces an `action_items` card: "Verify address for Maria Rodrigues" or "Confirm name spelling — did they mean Rodriguez?"
- **Workflow blocked** → The machine flags exactly what's missing. JARVIS surfaces it. Human resolves it. Machine continues.

### 0. Universal Media Viewer
**ALWAYS** use `<MediaViewer>` from `src/components/ui/media-viewer.tsx` when displaying any file (image, video, PDF, or unknown). Never write custom iframe/embed logic for viewing files. It auto-detects type via `getFileCategory()` from `src/lib/fileTypes.ts` and uses Google Docs Viewer for PDFs. Import: `import { MediaViewer } from "@/components/ui/media-viewer";`

### 1. Database ↔ UI Must Always Be In Sync
When you change ANY of these, you MUST check and update ALL related pieces:

| What Changed | Check These |
|---|---|
| Job status values | `JobStatusBadge.tsx` STATUS_CONFIG, `useJobs.ts` filters, `DashboardMetrics`, `ai-task-agent` queries, `calculate-travel-times` queries, `hcp-webhook` logic, Chat `getChatContext()` follow-up filter |
| Job fields/columns | All edge functions querying jobs, all hooks using jobs, JobDetail page, Jobs list page |
| New DB table | Create hook, create UI component, add to relevant pages, check if copilot agent needs context |
| Workflow step changes | `useWorkflowDefinitions.ts` default steps, `useWorkflowStage.ts` completion logic, `WorkflowActionBar`, `WorkflowProgressStrip`, `ai-task-agent` workflow state context |
| Customer fields | `useCustomers`, `CustomerDetail`, `ai-task-agent` getCustomersContext |
| Employee fields | `useEmployees`, Admin page, `ai-task-agent` getEmployeesContext, `calculate-travel-times` |
| Estimate fields | `useEstimates`, `EstimateDetail`, `hcp-webhook` estimate handler |
| Email system changes | `email-send`, `email-inbound-webhook`, `EmailPage`, `useEmails` |
| New edge function | Add to `supabase/config.toml` with `verify_jwt = false`, deploy |
| New knowledge/training category | Auto-discovered by `CopilotTraining.tsx` — no UI change needed ✓ |

### 2. Status Source of Truth
- **USE:** `jobs.status` (local) — values: `new`, `scheduled`, `in_progress`, `done`, `invoiced`, `on_hold`, `canceled`
- **NEVER filter on:** `jobs.hcp_status` — this is a legacy reference column only
- **On job creation only:** Set initial status from HCP work_status (canceled→canceled, complete→done, else scheduled/new)
- **After creation:** Status is managed locally, HCP changes do NOT overwrite it

### 3. Hardcoded Maps — Always Update These
These files contain hardcoded value→display mappings that MUST be updated when values change:
- `src/components/JobStatusBadge.tsx` — STATUS_CONFIG map (has smart fallback for unknown statuses)
- `src/components/AppHeader.tsx` — allNavItems (role-filtered navigation)
- `src/hooks/useJobs.ts` — status filter in queries

### 4. Edge Function Checklist
When editing ANY edge function:
- Always include CORS headers with the full `x-supabase-client-*` set
- Filter on `jobs.status`, never `jobs.hcp_status`
- Use `SUPABASE_SERVICE_ROLE_KEY` for server-side operations
- Add to `supabase/config.toml` if new
- Deploy after changes

### 5. Unified CustomerCard — ONE Way to Display Customers
**ALWAYS** use `<CustomerCard>` from `src/components/CustomerCard.tsx` when displaying customer info. Never build custom customer cards. It uses `CustomerStatusBadges` + `getAvatarColor` for consistent enrichment rendering. Variants: `list` (Customers page), `dispatch` (dispatch board), `caller` (softphone), `preview` (new customer dialog). Enrichment data comes from `useCustomerEnrichment()` (cached RPC) or `useCustomersPaginated()` (includes enrichment inline). The `get_customers_paginated` RPC handles server-side pagination, search, sorting, and enrichment in ONE query. **Customers page** uses `useCustomersPaginated` for server-side pagination (50 per page) — NEVER load all 2000+ customers at once.

---

## ⚠️ Known Bugs — Fix Before Adding New Features

All bugs from 2026-03-25 audit have been resolved as of 2026-03-26.

| # | Bug | Status | Resolution |
|---|-----|--------|------------|
| 1 | `APP_BASE_URL` hardcoded to preview URL | ✅ Fixed | Both agents use `https://csultramode.lovable.app` |
| 2 | `repair_quote` key missing from `ai_model_config` | ✅ Fixed | Row exists in database |
| 3 | `service_repair_items` table missing | ✅ Fixed | Table exists and is in use |
| 4 | `invoicing-agent` not writing `invoice_sent_at` | ✅ Fixed | Stamps timestamp after invoice creation |
| 5 | `repair-quote-agent` not writing workflow timestamp | ✅ Fixed | Now stamps `quote_generated_at` on jobs |
| 6 | `sales-docs-agent` missing `activity_log` entry | ✅ Fixed | Logs `estimate_converted_to_job` action |
| 7 | `match-invoice-to-job` not wired | ✅ Fixed | Called from both `extract-equipment-photo` and `email-inbound-webhook` |
| 8 | `.env` committed to GitHub | ⚠️ External | Must be removed manually from GitHub repo |

---

## System Architecture

### Data Flow: HCP → Database → UI
```
Housecall Pro (external)
  └─ Webhook (real-time) → hcp-webhook edge function → customers + jobs/estimates tables
                              ↓
                    Workflow engine tracks lifecycle via timestamp columns
                              ↓
                    UI reads from database via hooks
```

### Core Tables & Their Hooks
| Table | Hook | Primary UI |
|---|---|---|
| `jobs` | `useJobs`, `useJob` | Jobs list (root `/`), JobDetail, Follow-Up |
| `estimates` | `useEstimates` | Estimates (inline on Jobs), EstimateDetail |
| `customers` | `useCustomersPaginated` (paginated+enriched), `useCustomerNames` (lightweight lookup) | Customers list, CustomerDetail |
| `employees` | `useEmployees` | Admin page, Paysheet, travel times |
| `customer_invoices` | `useCustomerInvoices`, `useJobInvoices`, `usePublicInvoice` | Payments, JobDetail, InvoicePublic |
| `job_invoices` | `useJobInvoices` | JobDetail parts/materials tab — supply house invoices with `match_status`, `match_confidence`, `source` |
| `supply_houses` | `useSupplyHouses` | Supply house master list |
| `parts_catalog` / `part_supply_house_numbers` | `usePartsCatalog` | Parts with cross-reference numbers |
| `chat_channels` / `chat_messages` | `useChat` | Chat page |
| `emails` | `useEmails` | Email page |
| `copilot_training` | (direct query) | Agent Training, AI copilot context |
| `copilot_messages` | `useCopilotMessages` | Copilot page |
| `equipment_matchups` | `useEquipmentMatchups` | Parts page, brochure system |
| `parts_catalog` | `usePartsCatalog` | Parts page |
| `supply_houses` / `supply_house_locations` | `useSupplyHouseLocations` | Locations/Vendors page |
| `service_agreements` | `useServiceAgreements` | Agreements page |
| `sms_log` / `sms_templates` | `useSmsLog`, `useSmsTemplates` | SMS page, Copilot SMS |
| `call_log` | `useCallLog` | Calls page, Copilot context |
| `workflow_definitions` | `useWorkflowDefinitions` | Workflow Builder, WorkflowActionBar |

### Edge Functions & What They Do
| Function | Purpose | Triggered By |
|---|---|---|
| `hcp-webhook` | Real-time job/estimate events + customer upsert from HCP | HCP webhook |
| `ai-task-agent` | **ORCHESTRATOR** — AI copilot with collapsed direct-tool architecture. Communications, scheduling, sales-docs tools are inline. External invokes for repair-quote, invoicing, supplyhouse, carrier-enterprise. | Copilot chat |
| `email-agent` | **SPECIALIST** — Email search, thread reading, attachment extraction, brochure emails | Orchestrator invoke |
| `invoicing-agent` | **SPECIALIST** — Invoice creation, Stripe payment links ⚠️ `APP_BASE_URL` must be `https://csultramode.lovable.app`; must write `invoice_sent_at` to `jobs` table after creating invoice | Orchestrator invoke |
| `repair-quote-agent` | **SPECIALIST** — AI-powered tiered repair quotes with margin math ⚠️ must write a workflow timestamp to `jobs` after generating quote | Orchestrator invoke |
| `supplyhouse-agent` | **SPECIALIST** — Browser automation for SupplyHouse.com parts search, cart, text support | Orchestrator invoke |
| `carrier-enterprise-agent` | **SPECIALIST** — Browser automation for CarrierEnterprise.com parts/equipment search, orders import, pattern learning | Orchestrator invoke |
| `finalize-job` | **Centralized** post-creation side effects: format data, create chat channel, auto-stamp line items, auto-advance workflow, push to HCP, log activity. ALL job creation pathways must call this. | Job creation (UI, HITL, estimate conversion, customer-actions) |
| `calculate-travel-times` | Mapbox routing for tech schedules | Scheduling tools in orchestrator |
| `email-send` | Send emails via Mailgun | Email compose |
| `email-inbound-webhook` | Receive inbound emails | Mailgun webhook |
| `send-sms` / `sms-webhook` / `sms-status-callback` | Send/receive SMS via Twilio + delivery status tracking | Copilot / Twilio |
| `twilio-token` / `twilio-voice-twiml` | Softphone auth + outbound call routing | Softphone widget |
| `voice-webhook` | Inbound call handler: logs call, holiday detection, IVR greeting + menu | Twilio voice URL |
| `voice-ivr-handler` | Digit routing: dept hours check, after-hours/missed-call SMS, forward/ring | Twilio Gather callback |
| `voice-voicemail` | Voicemail recording: transcription, dept-specific missed-call SMS | Twilio Record callback |
| `voice-status-callback` | Call status updates + post-call transcript reconciliation | Twilio status callback |
| `stripe-checkout` / `stripe-webhook` | Payment processing | Invoice payment |
| `stripe-subscription` | Subscription management for maintenance plans | Stripe |
| `invoice-public` | Public invoice data + company branding + approved estimate by token | InvoicePublic page |
| `ahri-lookup` | AHRI certificate lookup | Equipment matchups |
| `extract-equipment-photo` | AI extract equipment data from photos | Job photos |
| `extract-invoice` / `extract-document-text` | AI extract data from uploaded docs | Invoice upload, Knowledge base |
| `match-invoice-to-job` | Match supply house invoices to jobs — 3 confidence tiers: high (auto-confirm), medium (auto-confirm), low (Copilot review queue). Writes `match_status` + `match_confidence` to `job_invoices`. | Photo extraction / Email webhook |
| `scout-warranty-portal` / `auto-register-warranty` | Warranty registration automation | Workflow step |
| `send-brochure-email` / `send-rebate-email` | Customer-facing emails | Brochure/rebate flows |
| `send-completion-summary` | Post-job completion summary email/SMS | Workflow completion |
| `send-finance-notice` | Finance option notification to customer | Invoice/estimate flow |
| `tech-form-chat` | AI chat in tech field forms | Public tech form |
| `fetch-job-attachments` / `archive-hcp-photos` | Photo management from HCP | Job photos |
| `invite-user` | Auth user invitation | Admin page |
| `lookup-property` | Property data lookup | Customer/job detail |
| `lookup-jurisdiction` | Permit jurisdiction lookup by address | Permit applications |
| `prefetch-property-data` | Pre-fetch property info on job creation | Job creation pipeline |
| `reconcile-equipment` | Cross-reference equipment sources | Equipment tab |
| `fetch-site-logos` | Fetch logos for quick links | Admin |
| `scrape-supply-locations` | Scrape supply house locations | Locations setup |
| `auto-advance-workflow` | Auto-advance workflow steps based on conditions | System automation |
| `auto-apply-permit` | Auto-apply for permits when jurisdiction is known | Workflow automation |
| `auto-follow-up-text` | Auto-send follow-up SMS | Workflow automation |
| `follow-up-inquiry` | Follow-up customer outreach | Workflow automation |
| `send-job-reminders` | Cron-triggered job reminder SMS | Scheduler |
| `send-review-request` | Post-job review request SMS | Workflow step |
| `send-push` | Push notifications to mobile devices via FCM | System events |
| `portal-auth` / `portal-customer-chat` | Customer portal auth + chat | Portal |
| `customer-actions` | Public customer actions (estimate approve/decline/question) | Customer-facing links |
| `create-deposit-invoice` | Auto-create deposit invoice from estimate approval | Estimate conversion |
| `sync-meta-audience` | Sync customer data to Meta audiences | Marketing |
| `facebook-lead-webhook` | Receive Facebook lead form submissions | Facebook Ads |
| `grammar-check` | Grammar correction | Copilot compose |
| `draft-vendor-reply` | AI-draft reply to vendor emails | Email workflow |
| `generate-cps-rebate` | Generate CPS Energy rebate application | Rebate workflow |
| `jarvis-approval-alert` | Notify office when JARVIS needs human approval | HITL card creation |
| `jarvis-stall-check` | Detect stalled JARVIS actions awaiting approval | Cron / system |
| `smart-scheduler` | AI-powered schedule optimization | Scheduling tools |
| `simulate-intake` | Simulate customer intake for testing | System test |
| `summarize-call` | AI-summarize completed call recordings | Post-call pipeline |
| `recording-proxy` | Authenticated proxy for Twilio recording fetches (HTTP Basic Auth) | Recording playback |
| `refresh-attachment-url` | Refresh expired HCP attachment URLs | Photo viewing |
| `sendgrid-event-webhook` | Track SendGrid email delivery events | SendGrid |
| `live-transcribe` | **Dual-track** real-time call transcription — routes inbound (caller) + outbound (agent) to separate Deepgram connections, labels `speaker` in `live_transcripts` table | Twilio `<Stream>` (both_tracks) |
| `transcribe-audio` | Batch audio transcription | Voicemail/recordings |
| `backfill-created-at` / `backfill-paid-dates` / `backfill-arrival-times` / `backfill-call-records` / `backfill-sms-contacts` | Data migration utilities | One-time |
| `import-hcp-history` | Import historical HCP data | One-time |
| `seed-armstrong-matchups` | Seed Armstrong equipment matchup data | One-time |
| `sync-hcp-jobs` | **Legacy** — bulk sync (keep for final photo run only) | Manual trigger |

### Authentication & Roles
- Auth via Supabase Auth (email/password)
- Roles stored in `user_roles` table (NOT on profiles): `admin`, `office`, `tech`
- `has_role()` security definer function for RLS policies
- Navigation filtered by role in `AppHeader.tsx`
- Dashboard defaults to paysheet tab for techs

### Key Integration Points
- **Mapbox**: Geocoding + directions in `calculate-travel-times`, job map view (`JobsMapView`)
- **Mailgun**: Email send/receive (`email-send`, `email-inbound-webhook`)
- **Twilio**: SMS send/receive (`send-sms`, `sms-webhook`, `sms-status-callback`) + Voice/softphone (`twilio-token`, `twilio-voice-twiml`, `voice-webhook`, `voice-status-callback`)
- **Stripe**: Invoice payments (`stripe-checkout`, `stripe-webhook`)
- **Firecrawl**: Web scraping for copilot research
- **HCP API**: Job/estimate sync (being phased out as native features grow)
- **Meta**: Audience sync (`sync-meta-audience`)
- **Deepgram**: Audio transcription (via `transcribe-audio`, `live-transcribe`)

---

## App Pages & Routes

### Primary Navigation (AppHeader)
| Route | Icon | Label | Roles |
|---|---|---|---|
| `/` | Briefcase | Jobs | admin, office |
| `/email` | Mail | Email | admin, office |
| `/sms` | Phone | SMS | admin, office |
| `/calls` | PhoneCall | Calls | admin, office |
| `/chat` | MessageSquare | Chat | admin, office |
| `/customers` | Users | Customers | admin, office |
| `/vendors` | Store | Vendors | admin, office |
| `/locations` | Warehouse | Supply Houses | admin, office |
| `/admin` | ShieldCheck | Admin | admin |

Nav order is user-customizable via `NavOrderEditor` in Admin settings.

### All Routes
| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard → Jobs | **Root route** — Jobs board with filters, dispatch board, map view (techs redirect to `/tech`) |
| `/tech` | TechDashboard | Tech-specific mobile-first dashboard |
| `/copilot` | CopilotPage | Mission Control — AI hub with Now/Actions/Chat tabs + full-screen dashboard |
| `/chat` | Chat | Team messaging (channels per job) |
| `/email` | EmailPage | Shared email inbox |
| `/sms` | SmsPage | SMS conversation threads (two-panel resizable) |
| `/calls` | CallsPage | Call log with threaded conversation view |
| `/jobs/follow-up` | UnscheduledJobs | Combined unscheduled + flagged follow-up jobs |
| `/jobs/:id` | JobDetail | Single job: workflow, equipment, invoices, photos, data |
| `/estimates/:id` | EstimateDetail | Single estimate detail |
| `/customers` | Customers | Customer CRM list |
| `/customers/:id` | CustomerDetail | Customer profile, equipment, history |
| `/vendors` | Vendors | Vendor management list |
| `/vendors/:id` | VendorDetail | Single vendor detail |
| `/locations` | LocationsPage | Supply houses & vendor management |
| `/agreements` | Agreements | Service agreement management |
| `/admin` | Admin | **Admin hub** — centralized back-office operations |
| `/admin/hub` | AdminMobileHub | Mobile-optimized admin navigation |
| `/parts` | PartsCatalog | Parts with supply house cross-reference |
| `/payments` | Payments | Invoice and payment dashboard |
| `/agent-training` | AgentTraining | AI copilot knowledge/instructions/tools/templates |
| `/agent-network` | AgentNetwork | Edge Functions Registry — status badges, caller/trigger metadata for all backend components |
| `/agent-pipeline` | AgentPipeline | Agent pipeline visualization |
| `/leads` | Leads | Lead management (Facebook, webhooks) |
| `/repair-catalog` | RepairCatalog | Repair service catalog |
| `/sales-presentations` | SalesPresentationAdmin | Presentation Design Studio (6-tab) |
| `/plans` | PlanBuilder | Maintenance plan tier configuration |
| `/workflow-builder` | WorkflowBuilder | Visual node-based workflow canvas |
| `/ivr-builder` | IvrBuilder | IVR flow designer |
| `/sequence-builder` | SequenceBuilder | Automated message sequence builder |
| `/customer-journey` | CustomerJourney | Customer lifecycle journey visualization |
| `/payment-flow` | PaymentFlow | Payment flow designer |
| `/admin/system-test` | SystemTest | End-to-end workflow test runner |
| `/portal/preview` | PortalPreview | Customer portal design preview |
| `/form/:token` | TechFormPublic | Unified tech field form for ALL job types (no auth) |
| `/preinstall/:token` | TechFormPublic | **Redirect only** → `/form/:token` (legacy) |
| `/intake/:token` | CustomerIntakePublic | Public customer intake form |
| `/photos/:jobId` | JobPhotos | Public job photos viewer |
| `/presentation/:token` | CustomerPresentation | Public sales/repair presentation |
| `/agreement/:token` | AgreementPresentation | Public agreement presentation |
| `/certificate/:token` | CertificateView | Public certificate viewer |
| `/invoice/:token` | InvoicePublic | Public customer-facing invoice (branded, Stripe pay, estimate summary) |
| `/portal/login` | PortalLogin | Customer portal login (passwordless) |
| `/portal/dashboard` | PortalDashboard | Customer portal dashboard |
| `/refer/:code` | ReferralPublic | Public referral submission form |
| `/login` | Login | Auth login |
| `/reset-password` | ResetPassword | Password reset |

### Route Redirects
| Old Route | Redirects To |
|---|---|
| `/jobs` | `/` |
| `/jobs/queue` | `/jobs/follow-up` |
| `/estimates` | `/` |
| `/settings` | `/admin?tab=config` |
| `/brochure` | `/sales-presentations` |
| `/inbox` | `/email` |
| `/paysheet` | `/admin?tab=paysheet` |
| `/reports` | `/admin?tab=reports` |

### Admin Hub (`/admin`)
The Admin page is a tabbed interface consolidating back-office tools. Tabs: Tools, Config, Paysheet, Reports, QuickLinks.

**Tool Cards** (links to standalone pages):
- **Mission Control** (`/copilot`) — violet accent
- **Parts Catalog** (`/parts`) — orange accent
- **Presentation Design Studio** (`/sales-presentations`) — amber accent
- **Workflow Builder** (`/workflow-builder`) — indigo accent
- **AI Agent Training** (`/agent-training`) — violet accent
- **Customer Portal Preview** (`/portal/preview`) — emerald accent
- **System Test Runner** (`/admin/system-test`) — emerald accent
- **Payments Dashboard** (`/payments`) — sky accent
- **Supply Houses & Vendors** (`/locations`) — teal accent

**Config tab** includes: Company Settings, Team Management, Employee Invitations, SMS Templates, Email Aliases, IVR Settings, Ringtone Settings, Nav Order, Human-in-the-Loop toggle, Copilot Permissions, Portal Copilot Permissions, Payment Plan Rules, Meta Audiences, Company Documents, Permit Authorities, Referrals, Webhooks.

The Admin tab in `AppHeader` remains active when navigating into any sub-area (parts, payments, agent-training, brochure, settings, plans, agreements, sales-presentations, workflow-builder, copilot).

---

## Presentation Design Studio

The Presentation Design Studio (`/sales-presentations`) is the centralized admin hub for designing and previewing all customer-facing documents. It has **6 tabs**:

| Tab | Icon | Component | Purpose |
|---|---|---|---|
| Sales | Eye | `SalesPresentationPreview` | Sales presentation preview with brand switcher (Good/Better/Best tiers) |
| Repair | Wrench | `RepairPresentationPreview` | Repair presentation with sample diagnostic data |
| Agreement | Shield | `AgreementPresentationPreview` | Agreement preview with embedded Maintenance Plan Template editor |
| Invoice | Receipt | `InvoicePreview` | Live branded invoice preview with sample data |
| Certificates | Award | `CertificateGallery` | Certificate template gallery (warranty, no-lemon, price-match, labor) |
| Content | Settings2 | Content managers | Brand Profiles, Presentation Sections, Blocks, Comparison Blocks, Add-ons |

All customer-facing documents share the same branded visual language: navy/gold headers, company logo, professional typography.

---

## Public Customer-Facing Portals

All public pages are token-based (no auth required) and share a consistent branded design:

| Portal | Route | Purpose |
|---|---|---|
| Sales/Repair Presentation | `/presentation/:token` | Interactive estimate with tier selection, payment choice, approve/decline/question actions |
| Agreement Presentation | `/agreement/:token` | Maintenance plan enrollment with plan options |
| Certificate Viewer | `/certificate/:token` | Printable warranty/labor/price-match/no-lemon certificates |
| Invoice Portal | `/invoice/:token` | Branded invoice with line items, approved estimate summary, Stripe "Pay Now" |
| Tech Form | `/form/:token` | Technician field completion form (all job types) |
| Job Photos | `/photos/:jobId` | Public job photo gallery |
| Customer Portal | `/portal/dashboard` | Self-service dashboard (jobs, invoices, equipment, agreements) |
| Referral Form | `/refer/:code` | Public referral submission |

### Invoice Portal Details
- **Branded header**: Navy/gold with company logo, name, address, TACLA#
- **Professional line-item table**: Alternating row shading, subtotal/tax/total breakdown
- **Approved Estimate Summary**: Shows customer's selected tier, add-ons, payment preference from `estimate_responses` — links back to `/presentation/:token`
- **Stripe "Pay Now"**: Payment with payment plan options (from `payment_plan_rules`)
- **Workflow integration**: SMS sends include `/invoice/{public_token}` link; payment stamps `paid_at`; workflow auto-advances past "Collect Payment"

---

## Common Patterns

### Phone Number Matching (ONE SOURCE OF TRUTH)
All phone-to-contact/job matching MUST use server-side DB functions that strip non-digits via `regexp_replace`. Never use `.like()`/`.ilike()` on phone columns.

| Tool | Purpose | Used By |
|------|---------|---------|
| `find_customer_by_phone(digits)` | Match phone → customer by last-10 digits | `resolveContact`, `useCallerLookup`, `summarize-call` |
| `find_job_by_phone(digits)` | Match phone → active job by `customer_phone` | `sms-webhook` |
| `resolveContact()` | Shared utility: employee (in-memory) + customer (RPC) | `voice-webhook`, `sms-webhook`, `send-sms`, `twilio-voice-twiml`, `backfill-call-records` |
| `link_call_to_customer()` | DB trigger on `call_log` insert | Automatic |

**NEVER** load all customers into memory to match phones. **NEVER** use `.like("%digits")` or `.ilike("%digits")` on formatted phone columns.

### Adding a New Feature
1. Create/update database table (migration tool)
2. Create React hook (`useXxx.ts`) to query/mutate
3. Create UI component(s)
4. Add to relevant page(s)
5. **If it adds agent knowledge (facts/reference)** → add entry in `copilot_training` table (Knowledge tab)
6. **If it adds agent behavioral rules/directives** → add entry in `agent_instructions` table (Instructions tab)
7. **If adding a new orchestrator tool** → add the tool definition + execution handler in `ai-task-agent/index.ts`, insert a row into `agent_tools` table, AND add a `Tool-*` knowledge entry in `copilot_training`. For complex domains, create a separate edge function and invoke it via `invokeSpecialist()`.
8. If copilot needs awareness → add context function in `ai-task-agent`
9. If it has statuses → add to relevant badge/map components
10. If it affects workflow → update `useWorkflowDefinitions.ts` default steps and `useWorkflowStage.ts` completion logic
11. Update this knowledge doc if it changes architecture

### Agent Training — Knowledge vs Instructions (CRITICAL DISTINCTION)
- **Knowledge** (`copilot_training` table) = Facts, reference info, tool documentation. Things the agent *knows*. Examples: company info, status definitions, system architecture, tool usage guides (`Tool-*` entries).
- **Instructions** (`agent_instructions` table) = Behavioral rules, directives, formatting mandates. Things the agent *must do*. Examples: data formatting rules, address verification workflow, scheduling limits, tone & style, escalation procedures.
- **Rule of thumb**: If it says "ALWAYS", "MUST", "NEVER", or sets a rule → it's an Instruction. If it describes what something is or how it works → it's Knowledge.
- Both are injected into the system prompt. Instructions can be toggled on/off. Knowledge categories are auto-discovered.

### Agent Tool Sync Rule (ALWAYS FOLLOW)
The AI agent uses a **collapsed hub-and-spoke model**:
1. **`agent_tools` table** — Master registry of all tools (labels tools as `Direct` or `External` for transparency)
2. **`ai-task-agent/index.ts`** — Most tools execute inline (Communications, Scheduling, Sales-Docs, Email capabilities collapsed into direct tool calls)
3. **`copilot_training` table** — `Tool-*` knowledge entries teach the agent WHEN/HOW to use each tool
4. **External edge functions** — Only complex domains remain as separate functions: `repair-quote-agent`, `invoicing-agent`, `supplyhouse-agent`, `carrier-enterprise-agent`
When adding a tool, add definition + execution handler in `ai-task-agent/index.ts` and insert into `agent_tools` table.

### Tool Architecture — Direct vs External
The orchestrator implements most tools directly to eliminate handoff latency. Only 4 complex domains remain as separate edge functions.

**Orchestrator** (`ai-task-agent`) — Direct tools (inline execution):
| function_name | Purpose | Category |
|---|---|---|
| `web_search` | Firecrawl web search | Research |
| `scrape_url` | Firecrawl URL scrape | Research |
| `lookup_equipment` | Search equipment matchups | Research |
| `verify_address` | Mapbox geocoding | Verification |
| `get_live_transcript` | Fetch live call transcript from `live_transcripts` by `twilio_sid` | Context |
| `update_instruction` | Self-improvement | Meta |
| `log_learning` | Audit trail | Meta |
| `send_sms_to_employee` | SMS to team member | Communications |
| `send_tech_form_link` | Tech form link via SMS | Communications |
| `search_sms_history` | SMS log search | Communications |
| `search_call_history` | Call log search | Communications |
| `read_chat_messages` | Read team chat | Communications |
| `send_chat_message` | Post to team chat | Communications |
| `search_emails` | Email search | Email |
| `read_email_thread` | Read email thread | Email |
| `extract_email_attachment` | AI extract from attachments | Email |
| `send_brochure_email` | Send brochure PDFs | Email |
| `create_quote` | Create tiered quote | Sales & Docs |
| `convert_estimate_to_job` | Estimate → job (writes activity log) | Sales & Docs |
| `generate_letterhead_document` | Branded letterhead | Sales & Docs |
| `get_travel_times` | Mapbox travel routing | Scheduling |
| `check_scheduling_fit` | Proposed job fit check | Scheduling |
| `suggest_schedule_optimization` | Multi-day optimization | Scheduling |
| `update_job_field` | Stamp individual fields on jobs | Operations |
| `create_job` | Create new job | Operations |
| `create_customer` | Create new customer | Operations |

**External Specialists** (separate edge functions, invoked via `invokeSpecialist()`):
| Tool | Edge Function | Purpose |
|---|---|---|
| `invoke_repair_quote` | `repair-quote-agent` | AI-powered tiered repair quotes with 65% margin target |
| `invoke_invoicing` | `invoicing-agent` | Invoice creation, Stripe payment links ⚠️ must write `invoice_sent_at` |
| `invoke_supplyhouse` | `supplyhouse-agent` | Browser automation for SupplyHouse.com |
| `invoke_carrier_enterprise` | `carrier-enterprise-agent` | Browser automation for CarrierEnterprise.com |

**Deleted agents** (collapsed into orchestrator): `communications-agent`, `sales-docs-agent`, `scheduling-agent`, `follow-up-check-in`

**Removed tools** (legacy — do NOT re-add): `add_template_task`, `remove_template_task`, `update_template_task`, `list_templates`, `handoff_to_agent`.

### Multi-Round Tool Execution Loop
The agent implements a **multi-step tool execution loop** (up to 5 rounds) for both Lovable AI and Anthropic paths:

1. AI receives system prompt + conversation history + available tools
2. If AI responds with `tool_calls`, the `executeToolCall()` function runs each tool
3. Tool results are appended to the conversation as tool/tool_result messages
4. AI is called again with the updated conversation (tools still available for chaining)
5. Repeat until AI responds with text only OR 5 rounds reached

**Key implementation details:**
- `MAX_TOOL_ROUNDS = 5` (Lovable AI path)
- `MAX_ANTHROPIC_ROUNDS = 5` (Anthropic path)
- `executeToolCall()` is a centralized function handling ALL tool execution
- Tool loading: In `chat` mode, enabled tools are read from `agent_tools` table; fallback to ALL tools if table is empty
- Briefing mode does NOT use tools (no `chatTools` passed)
- Streaming only supported for Anthropic chat mode (no tool loop during streaming)
- The Anthropic path converts OpenAI-style tool definitions to Anthropic format automatically (`name`, `description`, `input_schema`)

### Agent Modes
The edge function supports multiple modes via `body.mode`:
| Mode | Purpose | Tools? |
|---|---|---|
| `briefing` (default) | Morning briefing with stats/alerts | No |
| `chat` | Interactive conversation with tool access | Yes (from `agent_tools` table) |
| `parse_customer` | Extract customer info from raw text | Uses `format_customer` internally |
| `create_customer` | Create customer in HCP | No (direct API call) |
| `create_job` | Create job in HCP + optional scheduling | No (direct API call) |

### Context Injection (30+ parallel queries)
All context functions run in parallel via `Promise.all()`. Key context loaders:
- **`getTaskContext`** — Fetches active jobs (name is legacy — it loads from the `jobs` table, NOT task tables)
- **`getScheduleSummaryContext`** — Date-organized view with inline equipment and line items
- **`getTrainingContext`** — Knowledge base + agent instructions
- **`getEmployeesContext`** — Team roster with roles and contact info
- **`getCustomersContext`** — Full CRM database (paginated to bypass 1000-row limit)
- **`getCustomerJobHistoryContext`** — Top 50 most active customers with recent jobs
- **`getEmailContext`** — Last 100 emails with unread/starred/attachment stats
- **`getChatContext`** — Team chat channels with recent messages
- **`getSmsHistoryContext`** / **`getCallLogContext`** — Communication logs
- **`getEstimatesContext`** / **`getEstimateReviewsContext`** — Sales pipeline context
- **`getCustomerEquipmentContext`** — Equipment with age warnings for 10+ year units
- **`getVoicemailsContext`** — Unread voicemail counts and transcriptions
- **`getWarrantyContext`** / **`getQuotesContext`** / **`getReferralsContext`** — Additional business context

### Agent Training UI Architecture
The Agent Training page (`/agent-training`) has 6 sidebar tabs, each with its own self-contained component:
| Tab | Component | Hook/Data | File |
|---|---|---|---|
| Knowledge | `KnowledgeBase` → `CopilotTraining` | direct `copilot_training` query + document upload | `agent/KnowledgeBase.tsx` + `CopilotTraining.tsx` + `agent/CategoryCard.tsx` |
| Instructions | `InstructionsManager` | `useAgentInstructions` | `agent/InstructionsManager.tsx` |
| Tools | `ToolsRegistry` | `useAgentTools` | `agent/ToolsRegistry.tsx` |
| Output | `OutputTemplates` | `useEmailTemplates` + `useSmsTemplates` | `agent/OutputTemplates.tsx` |
| Learnings | `LearningsLog` | `useAgentLearnings` | `agent/LearningsLog.tsx` |
| Model | `CopilotModelSelector` | hardcoded model list | `CopilotModelSelector.tsx` |

Each tab is fully independent — no shared state between tabs. The `CategoryCard` component is a reusable card used by Knowledge entries (auto-save on blur, toggle active, delete). The Knowledge tab also supports document upload (PDF/DOCX/TXT) via the `extract-document-text` edge function.

### Dynamic UI Pattern (Preferred)
Instead of hardcoding lists, query the database for available values. Examples:
- `CopilotTraining.tsx` auto-discovers knowledge categories from DB
- `JobStatusBadge.tsx` has fallback formatting for unknown statuses
- Always prefer this pattern over hardcoded lists when practical

### Database-First Architecture
Zero hardcoded business logic or marketing content. All marketing copy (Why Us sections, Trust Strips, Brand Stories), user preferences (AI model choice), and operational configurations (QuickLinks, Permit Authorities, Supply House mappings) are stored in database tables. localStorage is strictly reserved for authentication tokens and offline form resilience. Redundant status color mappings are consolidated into `src/lib/statusColors.ts`.

### JobDetail Page Architecture
`JobDetail.tsx` delegates heavy UI to extracted components in `src/components/job/`:
| Component | File | Purpose |
|---|---|---|
| `JobPhotosGrid` | `job/JobPhotosGrid.tsx` | Photo gallery with lightbox |
| `JobLineItems` | `job/JobLineItems.tsx` | HCP line items table |
| `findMatchup` | `job/findMatchup.ts` | Equipment matchup lookup helper (used by rebate + warranty) |

### Job Type Detection
Jobs are categorized by parsing HCP description/tags: `install`, `service`, `maintenance`. Repair work is handled as `service`. The detection logic lives in `hcp-webhook`. If you add a new job type, update it there.

---

## What's Legacy vs Current
| Legacy (don't use) | Current (use this) |
|---|---|
| `jobs.hcp_status` for filtering | `jobs.status` for all filtering |
| HCP status overwriting local status | Local status management only |
| `/paysheet` route | Admin page → Paysheet tab |
| `/reports` route | Admin page → Reports tab |
| `/settings` route | Admin page → Config tab |
| `/jobs/queue` route | `/jobs/follow-up` (redirect in place) |
| `/brochure` route | `/sales-presentations` (redirect in place) |
| `/inbox` route | `/email` (redirect in place) |
| `/estimates` route | `/` root (estimates inline on jobs) |
| `/jobs` route | `/` root (dashboard IS the jobs board) |
| `job_tasks` / `task_templates` / `template_tasks` tables | **DROPPED** — workflow engine uses timestamp columns on jobs/estimates |
| Task seeding on job creation | Workflow steps auto-tracked via `useWorkflowStage.ts` |
| Manual task checklists / Kanban per job | `WorkflowActionBar` + `WorkflowProgressStrip` |
| `add_template_task` / `remove_template_task` / `update_template_task` / `list_templates` agent tools | **REMOVED** from `agent_tools` table + `ai-task-agent` code |
| `getTaskTemplatesContext()` in ai-task-agent | **DELETED** — no task tables to query |
| `sync-hcp-jobs` for regular syncing | `hcp-webhook` for real-time events (sync kept only for one-time photo archive) |
| `EstimateFormWizard.tsx` | **DELETED** — merged into `TechFormSections.tsx` |
| `PreinstallFormPublic.tsx` as full form | **Redirect only** — all forms unified into `TechFormPublic.tsx` via `TechFormSections` |
| `preinstall_surveys` / `preinstall_photos` tables for NEW data | New submissions use `tech_forms` / `tech_form_photos` (legacy tables still read for historical data) |

---

## Workflow Engine ("What's Next")

### Architecture
Job and Estimate progression is driven by **timestamp columns on the record itself**, NOT by task tables. The workflow engine finds the **first null timestamp** in the step sequence to determine the current "What's Next" action.

### How It Works (Plain English)
1. Each job type (install, service, maintenance) has a predefined list of steps
2. Each step maps to a column on the `jobs` table (e.g., `scheduled_date`, `dispatch_sent_at`, `photos_uploaded_at`)
3. The engine walks the list in order — the first step whose column is still `null` = "What's Next"
4. Some steps auto-skip based on conditions (e.g., skip deposit for financed jobs)
5. When all steps have values, the job is complete

### Key Components
| Component | File | Purpose |
|---|---|---|
| `WorkflowActionBar` | `src/components/WorkflowActionBar.tsx` | Primary "What's Next" button — single interface for advancing lifecycle |
| `WorkflowProgressStrip` | `src/components/WorkflowProgressStrip.tsx` | Visual step progress with checkmarks |
| `useWorkflowDefinitions` | `src/hooks/useWorkflowDefinitions.ts` | Step sequences per job type + DB persistence in `workflow_definitions` table |
| `useWorkflowStage` | `src/hooks/useWorkflowStage.ts` | Stage detection logic — `getStageInfo()` finds current step, `isStepComplete()` checks individual steps |
| `TechFormSections` | `src/components/TechFormSections.tsx` | Unified "What's Next" section-based form renderer for ALL job types |

### Step Sequences
- **Install**: 18 steps (Schedule → Assign → Deposit/Finance → Confirmation → Pre-install → Dispatch → ETA → On-Site → Completion Form → Photos → Warranty → Rebate → Inspection Schedule → Inspection Pass → Invoice → Payment → Review → Follow-up)
- **Service**: 12 steps (Schedule → Assign → Confirmation → Dispatch → ETA → On-Site → Completion Form → Photos → Invoice → Payment → Review → Follow-up)
- **Maintenance**: 13 steps (includes maintenance report + next visit scheduling at the end)
- **Estimate**: 10 steps (Schedule → Assign → Dispatch → ETA → On-Site → Tech Form → Review → Send Brochure → Won/Lost)

### Step Ownership
Each step has an `owner` field: `office`, `tech`, `customer`, or `system`. Handoff notifications are triggered automatically:
- **Tech owner**: SMS alert to the assigned technician
- **Office owner**: Logged in activity chat + UI toast
- **Customer owner**: Waiting on customer action (e.g., payment, approval)
- **System owner**: Auto-completable by automation

### Step Properties
- **`timestamp_field`** — maps to a column on the jobs table
- **`completion_check`** — `"timestamp"`, `"status"`, or `"field_set"`
- **`skip_when`** — conditional auto-skip (e.g., skip deposit for financed jobs)
- **`form_sections`** — which tech form step_group sections are filled during this step
- **`auto_completable`** — whether AI can auto-complete without human intervention
- **`auto_complete_condition`** — describes the trigger for autopilot chain
- **`action_links`** — external portals needed (warranty, permit, CPS rebate, supply house, etc.)
- **`position`** — `{x, y}` coordinates on the visual workflow canvas

### Features
- **Conditional skip** (`skip_when`) — e.g., skip deposit for financed jobs, skip rebate for non-eligible equipment
- **Dynamic labels** — step names substitute real tech/customer names (e.g., "Text Job Details to Mike" instead of "Text Job Details to Tech")
- **Undo** — revert most recent step with confirmation + audit logging (only manual steps, not auto-skipped)
- **Stuck detection** — jobs on the same step for 3+ days are flagged in Mission Control + Copilot briefings
- **Auto-status transitions** — final steps auto-set status to 'done'/'invoiced'
- **Post-action verification** — after stamping a timestamp, the system re-fetches the record to confirm it saved, with retry + error logging

### Visual Workflow Builder (`/workflow-builder`)
A node-based canvas powered by React Flow for designing job lifecycles visually:
- Draggable step cards with icons, labels, automation chips, and form section pills
- Arrow connections between steps
- Click a section pill → side panel with inline editor + live form preview (iframe to `/form/demo_{jobType}`) with anchor-based auto-scrolling
- Node positions and `form_sections` stored in the `steps` JSON column of `workflow_definitions` table
- Canonical form section utility in `useWorkflowDefinitions.ts` ensures consistency across UI and database

### CRITICAL: No Task Tables Exist
The `job_tasks`, `task_templates`, and `template_tasks` tables have been **permanently dropped**. Do NOT reference them in any code, queries, prompts, or UI. All progression is via workflow timestamps.

### Proactive Briefing Triggers (Section 16 in System Prompt)
The Copilot surfaces these items on every briefing:
1. 🚨 Stuck jobs (workflow step stalled 3+ days)
2. 📅 Today's schedule (who/what/where)
3. 📋 Unscheduled jobs (open jobs with no date)
4. 💰 Unpaid invoices (sent status > 7 days)
5. 📞 Missed follow-ups (pending estimates with no activity 3+ days)
6. ⚠️ Unread items (voicemails, SMS, emails — counts)
7. 🔧 Incomplete tech forms (submitted but not reviewed)

Mid-day checks re-surface anything that changed since morning.

---

## Mission Control & Copilot

### Architecture
Redesigned as a proactive operational hub:
- **Side Panel** (collapsible from right navy strip): 3 tabs — Now, Actions, Chat
- **Full-Screen Dashboard** (`/copilot`): Expanded view with Daily Briefing engine

### Now Tab
Proactive attention cards for:
- Overdue jobs and workflow blockers
- Tech proposals requiring review (expandable inline approval panel)
- Unread communications summary

### Actions Tab
Route-aware action buttons that change based on current page context.

### Chat Tab
AI conversation with session partitioning by `employee_id` and route context to prevent data leaks.

### Key Features
- Session-partitioned Copilot (per employee, per call)
- Document generation (`:::letterhead` syntax)
- Call preview workflow (preview-first before execution)
- Brand-aware marketing prompts
- Automated daily dispatch at 4:00 PM Central

---

## Unified Tech Form Architecture

All technician field forms (install, service, maintenance, estimate, preinstall) are rendered through a single pipeline:

### Components
| Component | File | Purpose |
|---|---|---|
| `TechFormPublic` | `src/pages/TechFormPublic.tsx` | Main page at `/form/:token` — handles data loading, saves, uploads, offline sync, geolocation |
| `TechFormSections` | `src/components/TechFormSections.tsx` | "What's Next" section-based renderer — groups fields by `step_group`, one active section at a time |
| `FormFieldsEditor` | `src/components/FormFieldsEditor.tsx` | Admin config — add/reorder/delete fields per job type, set step_group, conditions |

### Data Flow
```
/form/{jobId}_{empId}  →  TechFormPublic loads job, employee, fields from tech_form_fields
                       →  Creates/resumes tech_forms draft
                       →  Renders via TechFormSections (grouped by step_group)
                       →  Saves responses to tech_form_responses (auto-save on blur)
                       →  Photos → tech_form_photos + tech-form-photos bucket
                       →  On submit: paysheet entry (non-estimate) or estimate_reviews (estimate)
```

### Step Groups
Fields are grouped into collapsible sections via the `step_group` column on `tech_form_fields`. When null, the system auto-infers grouping from field type and label keywords. Available groups: `pickup`, `arrival`, `photos`, `specs`, `diagnosis`, `checklist`, `conditions`, `notes`, `completion`.

### Legacy Preinstall Form
`PreinstallFormPublic.tsx` is now a redirect to `/form/:token`. Historical preinstall data still lives in `preinstall_surveys` / `preinstall_photos` / `preinstall-photos` bucket and is read by `JobPhotos.tsx` and `ai-task-agent`. New preinstall submissions flow through the standard `tech_forms` pipeline.

### Features Available to All Job Types
- Auto-save + offline resilience (localStorage draft + queue)
- EXIF GPS extraction from photos
- AI equipment data extraction (data plate photos)
- Geolocation tracking
- Inline TechFormCopilot AI assistant
- Signature capture
- On My Way SMS button
- Progress tracking
- Button groups (single/multi select)

---

## Human-in-the-Loop Philosophy

The Copilot operates in **"draft and propose" mode** — it should NEVER auto-execute outbound actions. Every action that affects customers, team members, or records must be:
1. **Drafted** by the AI
2. **Presented** to the user for review
3. **Confirmed** before execution

This applies to: SMS, emails, invoices, schedule changes, estimate conversions, emergency dispatch, and any irreversible action.

The `company_settings.human_in_the_loop` flag controls this globally. When enabled (default for the next 3-4 months), the AI must always present actions in this format:
```
📋 Proposed Action: [what]
📝 Details: [specifics]
→ Ready to send? (yes/no)
```

The `HumanInTheLoopCard` in Admin → Config provides the master toggle + an optional SMS whitelist for extra safety during testing.

---

## External Services & Secrets
| Service | Secret Name | Purpose |
|---|---|---|
| Housecall Pro | `HCP_API_KEY`, `HCP_WEBHOOK_SECRET` | Webhooks + photo archive (legacy sync deprecated) |
| Mailgun | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_WEBHOOK_SIGNING_KEY` | Email |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS + Voice |
| Resend | `RESEND_API_KEY` | Transactional email (backup) |
| Firecrawl | `FIRECRAWL_API_KEY` | Web scraping |
| Lovable AI | `LOVABLE_API_KEY` | AI model access |
| Mapbox | Hardcoded public token in `calculate-travel-times` | Maps/routing |
| Stripe | `STRIPE_SECRET_KEY` | Payment processing |
| Deepgram | `DEEPGRAM_API_KEY` | Audio transcription |

---

## SMS System (`/sms`)
- **Two-panel resizable layout** (desktop: sidebar 15-50%, mobile: stacked list/thread)
- **Contact resolution**: Uses `resolveContact()` shared utility (`_shared/resolveContact.ts`) which calls the `find_customer_by_phone` DB function (strips non-digits server-side via `regexp_replace` before comparing last-10 digits). Employee matching uses in-memory loop (~10 records).
- **Job linking**: Uses `find_job_by_phone` DB function (same `regexp_replace` pattern on `jobs.customer_phone`) to link inbound SMS to active jobs.
- **Phone matching rule**: ALL phone-to-contact resolution across the system MUST use either `resolveContact()` or the `find_customer_by_phone`/`find_job_by_phone` RPCs. Never use `.like()`/`.ilike()` on phone columns — formatted strings like `(210) 827-3503` won't match raw digit searches.
- **Delivery status tracking**: `sms-status-callback` edge function receives Twilio delivery events → updates `sms_log.delivery_status` column → UI shows ✓✓ (delivered), ⏰ (sent/queued), ⚠️ (failed)
- **Cursor-based pagination**: "Load older messages" button, bypasses 500-message limit
- **SMS templates**: Reusable templates with category/variable support via `SmsTemplatePicker`
- **Embedded threads**: Read-only SMS tabs on Customer Detail and Job Detail pages
- **Desktop notifications**: Browser Notification API for inbound SMS when tab is backgrounded (`useDesktopNotifications`)

## Call System (`/calls`)
- **Threaded conversation view** mirroring SMS layout (resizable panels, Team/Customer grouping)
- **`call_log` table**: Tracks direction, duration, status, Twilio SID, recording URLs, contact resolution
- **Real-time updates**: Supabase realtime subscription on `call_log` table
- **Redial**: Click-to-call from any log entry using the in-app softphone
- **Call status badges**: completed, no-answer, busy, failed, voicemail
- **Recording playback**: Direct links to Twilio recordings when available

## Softphone (`SoftphoneWidget`)
- **Browser-based WebRTC dialer** using Twilio Voice SDK
- **Auto-registers** on login, destroys on sign-out
- **Caller ID resolution**: Resolves incoming numbers against employees + customers tables
- **Floating UI** at `bottom-32`, intercepts `tel:` links
- **Audio engine**: Synthesized DTMF tones + customizable ringtones (presets + custom uploads in `ringtones` bucket)
- **Backend**: `twilio-token` for auth, `twilio-voice-twiml` for outbound routing
- **Live transcript context**: `SoftphoneStrip` passes `twilio_sid` + latest ~500 words of finalized transcript into `pageContext` so JARVIS has real-time conversational awareness during active calls

## Copilot Integration with SMS/Calls
The AI agent (`ai-task-agent`) has:
- **SMS context**: Last 50 SMS messages with direction, contact, body, job reference
- **Call log context**: Last 50 calls with direction, contact, status, duration, recording flag
- **Live call transcript**: During active calls, `pageContext` includes `twilio_sid` and rolling transcript text; JARVIS can also call `get_live_transcript` tool for the full conversation on demand
- **`search_sms_history` tool**: Targeted SMS lookup by phone/name/content keyword
- **`search_call_history` tool**: Targeted call log lookup by phone/name/status/direction
- **`send_sms_to_employee` tool**: Send SMS to team members
- **Page awareness**: CopilotSidePanel includes route labels for `/sms` and `/calls`

---

## Unified Media Components

**ALWAYS use these shared components for rendering files. Never write inline file-type detection or PDF iframes.**

### File Type Detection
`src/lib/fileTypes.ts` — Centralized helpers:
- `getFileCategory(fileName, fileType)` → returns `"image" | "video" | "pdf" | "other"`
- `pdfViewerUrl(publicUrl)` → returns Google Docs Viewer embed URL

### Grid Thumbnails
`src/components/ui/media-thumbnail.tsx` — `<MediaThumbnail>` component:
- Auto-detects file type from `fileName` / `fileType` props
- Renders: images as thumbnails, videos with play icon, PDFs with FileText icon, unknown with File icon
- Props: `url`, `fileName`, `fileType`, `category?` (override), `onClick`, `className`

### Full-Size Viewer
`src/components/ui/media-viewer.tsx` — `<MediaViewer>` component:
- Auto-detects file type and renders appropriately
- Images: inline `<img>` with object-contain
- Videos: `<video controls>`
- PDFs: Google Docs Viewer iframe + "Open in new tab" link
- Unknown: download link
- Props: `url`, `fileName`, `fileType`, `category?` (override), `maxHeightClass?`

### Usage
```tsx
import { MediaThumbnail } from "@/components/ui/media-thumbnail";
import { MediaViewer } from "@/components/ui/media-viewer";

// Thumbnail grid
<MediaThumbnail url={file.url} fileName={file.name} onClick={() => setSelected(file)} />

// Lightbox / detail view
<MediaViewer url={selected.url} fileName={selected.name} />
```

### Where It's Used
- `JobPhotos.tsx` (public gallery)
- `JobPhotosGrid.tsx` (job detail tab)
- `CustomerDetail.tsx` (customer photos tab)
- `ManufacturerBrochures.tsx` (brochure preview)

---

## IVR & Voicemail System

### Architecture
Inbound calls flow through a multi-step TwiML pipeline with **per-department hours** (no global business hours):

```
Inbound Call → voice-webhook
  ├─ Holiday detected? → holiday greeting → voicemail → holiday SMS
  └─ Not a holiday → greeting + <Gather> menu (always plays)
       ├─ Digit match → voice-ivr-handler
       │    ├─ Dept closed? → dept after-hours greeting → voicemail → dept after-hours SMS
       │    ├─ Dept open → forward_client → <Dial><Client> (browser softphone)
       │    │              → forward_phone → <Dial><Number> (external phone)
       │    │              → say_message → <Say> message → hangup
       │    └─ Call goes to voicemail (during hours) → dept missed-call SMS
       └─ No input (2 retries) → voicemail fallback
```

### Key Design Decisions
- **No global business hours** — each department controls its own schedule independently
- **One global greeting** — plays before the menu, same for all callers
- **Per-department SMS** — each dept has its own after-hours SMS and missed-call SMS with personalized names (e.g. "This is Matt" for Service, "This is Clint" for Sales)
- **`{{hours}}` variable** — dynamically resolves to the department's configured schedule (e.g. "Mon–Fri 8am–5pm, Sat 9am–1pm") so SMS auto-updates when hours change seasonally
- **Holiday detection** — auto-detects New Year's Day, Labor Day, Thanksgiving (+day after), Christmas Eve, Christmas and plays holiday-specific greetings/SMS, skipping the IVR menu entirely
- **First-person voice** — all SMS use "I" not "we" for personal tone

### Database Tables
- **`ivr_config`** — Single-row config: greeting text/audio, voicemail toggle, ring timeout, caller ID mode
- **`ivr_menu_options`** — Per-department config: digit→action mapping, dept hours (weekday + Saturday override), after-hours greeting (text + audio), `dept_after_hours_sms`, `dept_missed_call_sms`
- **`voicemails`** — Recording entries linked to `call_log`, with realtime enabled for live badge updates

### Edge Functions
- **`voice-webhook`** — Inbound call handler: logs call, detects holidays, plays greeting + menu
- **`voice-ivr-handler`** — Handles `<Gather>` digit callbacks: checks dept hours, routes or plays after-hours flow, sends dept-specific SMS
- **`voice-voicemail`** — Recording completion callback: inserts voicemail, sends dept-specific missed-call SMS (passes digit through URL param)

### UI Components
- **`IvrSettingsCard`** — Three sections: Main Greeting, Call Settings (voicemail/ring timeout/caller ID), Departments (each with hours, after-hours greeting, after-hours SMS, missed-call SMS)
- **`VoicemailPanel`** — Voicemail list with playback, read/unread state, delete (Calls page → Voicemail tab)
- **AppHeader** — Unread voicemail badge on Calls nav item

### Hooks
- **`useIvrConfig`** — CRUD for `ivr_config` and `ivr_menu_options` (ordered by digit)
- **`useVoicemails`** — Realtime voicemail list with unread count, markAsRead, delete

---

## Job Reminders System

### Architecture
A database trigger (`trg_create_job_reminders` via `create_job_reminders()`) auto-schedules SMS reminders in the `job_reminders` table whenever a job is created or its `scheduled_date` changes. One reminder is created:
- **`day_before`** — scheduled for 4:00 PM Central the day before

### Edge Function: `send-job-reminders`
- Cron-triggered (should be invoked periodically)
- Fetches pending reminders that are due, sends SMS via `send-sms`
- Customers can reply **C** to confirm or **R** to reschedule (parsed by `sms-webhook`)
- Respects `company_settings.reminders_enabled` toggle

### Database Table: `job_reminders`
- `job_id`, `reminder_type` (day_before/morning_of), `scheduled_for`, `status` (pending/sent/failed/skipped), `sent_at`

---

## On My Way (OMW) System

### Components
- **`OnMyWayButton`** — Embedded in Job Detail, TechForm, PreinstallForm
- Sends SMS to customer with dynamic ETA (via `calculate-travel-times`) and tech name
- Tracks `jobs.on_my_way_sent_at` to prevent duplicates
- Includes A2P compliance footer

---

## Customer Portal

### Architecture
Passwordless login: customer enters email → receives 6-digit code → code verified → portal session token created.

### Edge Function: `portal-auth`
- `action: "send_code"` — looks up customer by email, creates code in `customer_portal_codes` (10 min expiry), sends via `send-sms`
- `action: "verify_code"` — validates code, creates `customer_portal_sessions` token (30 day expiry)

### Database Tables
- **`customer_portal_codes`** — OTP codes with expiry and used flag
- **`customer_portal_sessions`** — Session tokens with 30-day expiry

### Pages
- `/portal/login` — Portal login page
- `/portal/dashboard` — Customer dashboard (jobs, invoices, equipment, agreements)
- `/portal/preview` — Admin preview of portal experience

### Hooks
- **`usePortalSession`** — Manages portal session token in localStorage, fetches customer data

---

## Maintenance Plans & Service Agreements

### Database Tables
- **`service_agreements`** — Customer agreements with plan type, status, billing info, start/end dates
- **`agreement_visits`** — Visit records linked to agreements and jobs
- **`maintenance_plan_templates`** — Configurable plan tiers (Bronze/Silver/Gold/Platinum) with pricing, perks, and included services

### Pages & Components
- `/agreements` — Agreement list with filters
- `/plans` — Plan builder and template management
- **`MaintenancePlanTemplatesCard`** — Plan tier editor (also embedded in Agreement tab of Design Studio)
- **`PlanPerkHistory`** — Shows customer perk usage (total savings, remaining tune-ups)

### Copilot Integration
Agent is aware of plan tiers and perk usage history to provide financial summaries and suggest member-only discounts.

---

## A2P SMS Compliance

All automated outbound SMS messages include the compliance footer:
> Msg & data rates may apply. Reply STOP to opt out.

This is appended in:
- `OnMyWayButton.tsx` (frontend)
- `send-job-reminders` edge function
- `send-review-request` edge function

For Twilio A2P 10DLC registration, the external website (carnesandsons.com) contact form needs a visible SMS consent checkbox with disclosure text.

---

## Softphone Behavior
- Starts **minimized** (FAB only) on page load
- Auto-opens only for **incoming calls** (ringing status)
- For outbound calls, only auto-opens if user has previously interacted with the widget in the current session
- `hasBeenOpened` state tracks user interaction

### Click-to-Call & Call-Scoped Copilot Sessions
All phone numbers across the app use the `<ClickToCall>` component (`src/components/ClickToCall.tsx`), which:
1. **Dials** the number via the softphone (`useSoftphoneContext().dial()`)
2. **Creates a new call-scoped Copilot session** via `CopilotPanelContext.startCallSession(phone, contactName)`
3. The Copilot opens with an isolated session (labeled "Call — ContactName"), auto-sends a customer lookup query
4. Uses `e.stopPropagation()` so it works inside clickable table rows and cards

### Copilot Sessions Architecture
- **`copilot_sessions` table**: Tracks `id`, `user_id`, `employee_id`, `label`, `call_sid`, `phone_number`, `created_at`, `ended_at`
- **`copilot_messages.session_id`**: FK to sessions — all messages are scoped to a session
- **`useCopilotSessions` hook**: CRUD for sessions, tracks `activeSessionId`, auto-creates "General" session on first load
- **`useCopilotMessages` hook**: Now takes `sessionId` param, loads/persists messages only for that session
- **Session Picker**: Dropdown in Copilot header shows recent sessions (last 10), archived sessions are read-only
- **"New Chat" button**: Archives current session (`ended_at` set) and creates a fresh "General" session — no data deleted
- **Call sessions**: Auto-created by `ClickToCall`, labeled "Call — Name", include phone_number/call_sid
- **Data isolation**: AI context only includes current session's messages, preventing caller data bleed between calls
- **`CopilotPanelContext`** methods: `sendQuery()`, `consumePendingQuery()`, `startCallSession()`, `consumePendingCallSession()`

Pages using ClickToCall: Customers list (table + card views), Dispatch Board, Customer Detail, Job Detail, Call Log (redial).

### Post-Call Transcript Reconciliation
**Live transcription is ENABLED** (`company_settings.live_transcription_enabled = "true"`). During calls, `live-transcribe` captures dual-track audio (caller + agent) via separate Deepgram connections with speaker labeling.

When a call completes (`voice-status-callback` with status `completed`), the system:
1. Fetches live stream fragments from `live_transcripts` (if any)
2. Simultaneously requests a batch Deepgram transcription of the Twilio recording
3. Compares both transcripts — if live captured >20% more words (e.g. early start advantage), it's preferred; otherwise batch wins for better punctuation/formatting
4. Saves the best transcript to `call_log.transcription` with source metadata
5. Cleans up `live_transcripts` fragments for that call

---

## Global Layout — Right Navy Strip

All authenticated pages are wrapped by `ProtectedRoute.tsx`, which provides:
- A **flex container** (`flex h-screen overflow-hidden`) so content scrollbars appear inside the layout
- A **`w-12` navy gradient strip** on the right side with Copilot toggle (Bot icon) and Phone toggle
- The **Copilot side panel** (30vw, min 280px) slides in from the right when toggled
- Content area uses `flex-1 min-w-0 overflow-y-auto` so scrollbars render to the LEFT of the navy strip
- The Copilot auto-opens on incoming calls or outbound connections

This means individual pages should NOT add their own right margin or duplicate the navy strip. Pages fill the content area naturally.

---

## Floating Widget Styling

Both the **CopilotFab** and **SoftphoneWidget** use the `accent` design token for their background color (`bg-accent text-accent-foreground`), matching the app's orange accent color. When updating the accent color in the design system, both widgets update automatically.

---

## Sales Pricing & Factory Rebates

### Pricing Model
- **Factory Rebates** are stored in `pricing_formulas.cash_rebate` per brand/tier
- The Sales Pricing Calculator derives prices from `component_price` + Materials + Labor + Profit + Tax → Lowest Margin Price → Financed Price (+ finance %) → Pay in Full Price (Financed − Factory Rebate)
- **Financed Price** is the default sales quote price (Option A — 0% financing)
- **Pay in Full Price** (`factory_rebate_price` on `equipment_matchups`) = Financed Price − Factory Rebate (Option B — cash/check/CC)
- **Monthly Payment** (`monthly_payment` on `equipment_matchups`) = Financed Price × 2.78% payment factor — pre-calculated and stored, NOT computed on the fly

### Price Breakdown (code: `calculatePrices` in `usePricingFormulas.ts`)
| Step | Field | Formula |
|---|---|---|
| 1 | `lowestMarginPrice` | equipment + materials + labor + profit + tax (floor/cost-plus price) |
| 2 | `financedPrice` | lowestMarginPrice × (1 + finance_rate%) |
| 3 | `factoryRebatePrice` | financedPrice − factory rebate (= Pay in Full price) |
| 4 | `monthlyPayment` | financedPrice × 0.0278 (2.78% payment factor for 0% / 36mo) |

### Column Labels in Equipment Matchups Table
| Column | Shows | Old Label |
|---|---|---|
| **Low Margin** | `lowestMarginPrice` — internal floor price | was "Cash" |
| **Financed** | `financedPrice` — 0% financing quote price | unchanged |
| **Pay in Full** | `factoryRebatePrice` — cash/check/CC price after factory rebate | was "Factory Rebate" |
| **Mo Pmt** | `monthlyPayment` — pre-calculated 36-month payment | new column |

### Payment Factor
- **0% for 36 months** uses a **2.78% payment factor** (not simple division by 36)
- Stored in `company_settings` as `payment_factor = '2.78'`
- `monthly_payment = total_price × 0.0278`
- Pre-calculated and persisted to `equipment_matchups.monthly_payment` on every save
- The "Recalculate All Prices" batch tool also updates `monthly_payment` for all rows

### Payment Options (Mutually Exclusive)
Customers choose **one** of two options — they CANNOT combine them:
- **Option A — 0% Financing for 36 Months**: Monthly payment = pre-stored `monthly_payment`. No factory rebate applied.
- **Option B — Pay in Full (Factory Rebate)**: Price = Financed Price − Factory Rebate. Cash, check, or credit card.

### Rebate Stacking Rules
- **CPS Energy Rebates** (`early_rebate`, `burnout_rebate` in `equipment_matchups`) are utility rebates and **always apply** regardless of payment option
- **Public Servant Discount** ($250) **always applies** regardless of payment option
- **Factory Rebate** is **only** applied when customer chooses "Pay in Full" (Option B)
- 0% financing is **only** available with Option A (no factory rebate)

### Database
- `pricing_formulas.cash_rebate` — factory rebate amount per brand/tier (DB column name kept as `cash_rebate` for backward compat)
- `equipment_matchups.total_price` — persisted financed price (0% APR quote price)
- `equipment_matchups.factory_rebate_price` — persisted pay-in-full price (financed − factory rebate)
- `equipment_matchups.monthly_payment` — persisted monthly payment (total_price × 0.0278)
- `company_settings.payment_factor` — the 2.78% factor stored for reference
- `estimate_reviews.payment_preference` — `'financing_36mo'` | `'pay_in_full'` | `null` (customer's chosen option)

### Copilot Pricing Rules (CRITICAL)
The AI Copilot is **strictly prohibited** from performing any price calculations. It must:
- Use `total_price` for the Financed price
- Use `factory_rebate_price` for Pay in Full
- Use `monthly_payment` for the 36-month payment
- All values are pre-stored in `equipment_matchups` — zero math on the fly
- A mandatory `PRICING RULE` guardrail is injected into the runtime context

### Brochure Integration
The brochure pricing section shows both options side by side:
- Option A card: 0% APR, monthly payment (from `monthly_payment`), 36 months
- Option B card: Pay in full with factory rebate + CPS rebate deducted
- CPS rebate line items sourced from `equipment_matchups.early_rebate`/`burnout_rebate`

---

## Customer & Job Creation

### AI-Powered Creation Dialogs
- **`NewCustomerDialog`** and **`NewJobDialog`** — feature "Paste SMS" mode to parse raw text into database fields and detect duplicates
- Surfaced globally on Customers, Jobs, and Follow-Up pages
- **`NewJobDialog`** includes emergency fee acknowledgment checkbox (value from `company_settings.emergency_fee`)
- All outbound HCP API calls for record creation have been removed
- HCP identifiers preserved strictly for legacy mapping and webhook sync

---

## Customer Invoicing

### Architecture
Native invoicing system using `customer_invoices` and `customer_invoice_items` tables.
- Invoice numbers match job numbers with alphabetical suffixes for additional invoices
- Default tax rate read from `company_settings.tax_rate` (default 8.25%)
- SMS delivery with public invoice link (`/invoice/{public_token}`)
- HCP imports convert cents to dollars and negate positive discount/rebate values
- All totals floored at $0.00 minimum

### Public Invoice Portal
Token-based page at `/invoice/:token` with deluxe branded design matching sales presentations:
- Branded header with company logo
- Professional line-item table
- **Approved Estimate Summary** — shows selected tier, add-ons, payment preference from `estimate_responses`
- Link back to original presentation (`/presentation/:token`)
- Stripe "Pay Now" with payment plan options (from `payment_plan_rules`)
- Workflow integration: stamps `invoice_sent_at` and `paid_at` for auto-advancement

### Key Files
| File | Purpose |
|---|---|
| `src/pages/InvoicePublic.tsx` | Public invoice page |
| `src/hooks/usePublicInvoice.ts` | Fetch invoice by token |
| `src/components/brochure/InvoicePreview.tsx` | Design Studio preview |
| `supabase/functions/invoice-public/index.ts` | Edge function: invoice data + estimate context |
| `src/components/CustomerInvoicePanel.tsx` | Admin invoice management (create, send SMS, mark paid) |

---

## SupplyHouse.com Parts Agent

### Overview
The Parts AI Agent automates searching and ordering HVAC parts from SupplyHouse.com using Firecrawl browser automation (same pattern as warranty registration).

### Capabilities
1. **Login** — Creates a browser session and logs into the company SupplyHouse.com account using encrypted secrets (`SUPPLYHOUSE_EMAIL`, `SUPPLYHOUSE_PASSWORD`)
2. **Search** — Searches for parts by keyword/model number, returns product names, prices, SKUs, and availability
3. **Add to Cart** — Navigates to a product page and clicks "Add to Cart" with optional quantity
4. **Text Support** — SMS fallback: texts SupplyHouse support at 888-551-7600 via the existing `send-sms` function for special/hard-to-find parts

### Architecture
- **Edge Function**: `supabase/functions/supplyhouse-agent/index.ts`
- **Orchestrator Integration**: Available via `handoff_to_agent` with `agent_name: "supplyhouse"` and `parameters: { action: "search"|"add_to_cart"|"text_support", ... }`
- **Tools in `agent_tools` table**: `search_supplyhouse`, `order_from_supplyhouse`
- **Live View**: Reuses the WarrantyLiveView iframe pattern for real-time browser observation
- **Secrets**: `SUPPLYHOUSE_EMAIL`, `SUPPLYHOUSE_PASSWORD` (encrypted, never in code)

### Actions via Handoff
| Action | Params | Returns |
|---|---|---|
| `create_session` | (none) | `sessionId`, `liveViewUrl` |
| `search` | `session_id`, `query` | Array of `{ name, price, sku, url, availability }` |
| `add_to_cart` | `session_id`, `product_url`, `quantity?` | Cart confirmation |
| `text_support` | `part_description`, `job_id?` | SMS confirmation |

---

## Carrier Enterprise Parts Agent

### Overview
The CE Agent automates searching and ordering HVAC parts/equipment from CarrierEnterprise.com (dealer portal) using Firecrawl browser automation.

### Capabilities
1. **Login** — Creates a browser session and logs into the company CE account using encrypted secrets (`CARRIER_ENTERPRISE_EMAIL`, `CARRIER_ENTERPRISE_PASSWORD`)
2. **Search** — Searches for parts by keyword/model number, returns product names, prices, SKUs, and availability
3. **Add to Cart** — Navigates to a product page and clicks "Add to Cart" with optional quantity
4. **Check Pricing** — Views dealer pricing details for a specific product URL

### Architecture
- **Edge Function**: `supabase/functions/carrier-enterprise-agent/index.ts`
- **Orchestrator Integration**: Available via `handoff_to_agent` with `agent_name: "carrier_enterprise"` and `parameters: { action: "search"|"add_to_cart"|"check_pricing"|"fetch_orders"|"fetch_order_detail"|"import_orders"|"analyze_patterns"|"get_suggestions", ... }`
- **Tools in `agent_tools` table**: `search_carrier_enterprise`, `order_from_carrier_enterprise`, `Import CE Orders`, `CE Order Suggestions`
- **Secrets**: `CARRIER_ENTERPRISE_EMAIL`, `CARRIER_ENTERPRISE_PASSWORD` (encrypted, never in code)
- **Database**: `ce_order_items` table stores scraped order line items linked to jobs via `job_id`; `order_patterns` table stores aggregated part frequency per job category

### Actions via Handoff
| Action | Params | Returns |
|---|---|---|
| `create_session` | (none) | `sessionId`, `liveViewUrl` |
| `search` | `session_id`, `query` | Array of `{ name, price, sku, url, availability }` |
| `add_to_cart` | `session_id`, `product_url`, `quantity?` | Cart confirmation |
| `check_pricing` | `session_id`, `product_url` | `{ name, sku, price, listPrice, dealerPrice, availability }` |
| `fetch_orders` | `session_id`, `date_filter?` ("yesterday"/"today") | Matched orders with `job_id`, `job_number`, `customer_name` |
| `fetch_order_detail` | `session_id`, `order_url`, `job_id`, `ce_order_number` | Extracted line items (Item#, MFR#, serial, price, image) stored in `ce_order_items` + serials in `job_equipment` |
| `import_orders` | `session_id`, `date_filter?` | Full pipeline: fetches orders → matches POs → extracts details → stores everything |
| `analyze_patterns` | (none) | Rebuilds `order_patterns` table from all historical `ce_order_items` data. Groups by job_type + system_type + orientation. Returns category count and pattern count. |
| `get_suggestions` | `job_id` OR `job_type` + `system_type` + `orientation?` | Ranked list of suggested parts with frequency %, avg qty, avg price, and image. Falls back to broader category if exact match has no data. |

### Order Import Pipeline
When the user says "pull yesterday's CE orders":
1. Orchestrator hands off to `carrier_enterprise` with `{ action: "create_session" }`
2. Then `{ action: "import_orders", session_id, date_filter: "yesterday" }`
3. The agent scrapes the orders page, matches PO column to `jobs.job_number`
4. For each match, navigates to the order detail page and extracts:
   - Product name, CE Item #, MFR #, Serial Number, Qty, Price, Subtotal, Image URL
5. Stores line items in `ce_order_items` table (linked to job)
6. Upserts serial numbers into `job_equipment` with `source: 'carrier_enterprise'`, `confidence: 'high'`

### Smart Order Suggestions (Pattern Learning)
The system learns what parts are commonly ordered per job category by analyzing historical `ce_order_items` data.

**How it works:**
1. `analyze_patterns` action joins `ce_order_items` → `jobs` and groups by `(job_type, system_type, orientation, item_number)`
2. Computes frequency (how many jobs of that type included each item), average quantity, and average price
3. Stores results in the `order_patterns` table (category = "install:gas_heat:vertical")
4. `get_suggestions` looks up patterns for a job's category and returns items ranked by frequency

**Categories:** Patterns are keyed by `job_type:system_type:orientation` (e.g. `install:gas_heat:vertical`, `install:heat_pump:horizontal`). Falls back to `job_type:system_type:any` if exact orientation match has no data.

**Usage:** "What do I usually order for a 3-ton gas heat closet install?" → AI calls `get_suggestions` with `{ job_type: "install", system_type: "gas_heat", orientation: "vertical" }` and returns a ranked parts list with percentages.
