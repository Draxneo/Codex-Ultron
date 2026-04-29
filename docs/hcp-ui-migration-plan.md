# HCP UI Migration Plan

Goal: make UltraOffice feel familiar to a Housecall Pro-trained team while keeping UltraOffice data, Jarvis, presentation selling, automation, and HVAC-specific workflows.

## Boundaries

- Use HCP as an operational UX reference, not a pixel-for-pixel clone.
- Do not copy private customer/account data into docs or code.
- Do not click destructive, sending, purchasing, billing, permission, or account-change actions during review.
- Screenshots captured during review are for layout reference only and should avoid exposing customer details wherever possible.

## HCP Patterns To Mirror

### Global Shell

- Persistent primary navigation.
- Right utility cluster: global search, New, notifications/status, tools/apps, account.
- `New` is the central creation hub.
- The app opens into operational work, not marketing content.

UltraOffice target:

- Schedule
- Phone
- SMS
- Customers
- Estimates
- Price Book
- Payments
- Jarvis
- Admin

### Home / Command Center

HCP home is a quick operations board:

- Open estimates
- Unscheduled jobs
- Open invoices
- Service visits / upcoming appointments
- Month-to-date metrics
- Employee status
- Map
- Recent activity

UltraOffice target:

- Keep Schedule as the office default.
- Add a dashboard/command-center mode later for open estimates, unscheduled work, money, and live team status.

### Schedule

HCP schedule keeps controls near the calendar canvas:

- Today
- Bulk actions
- Date range
- Previous / next
- Employee filter
- View selector: schedule, dispatch, day, week, weekday, month
- Mini calendar
- Filter by name/address/tag

UltraOffice target:

- Preserve current week/day/dispatch/map modes.
- Make view names and control placement more HCP-like.
- Keep unscheduled/backlog adjacent to the schedule.

### Customers

HCP customers page is a dense work table:

- Search customers
- Filter
- Edit columns
- Create customer
- Actions
- Row selection
- Sortable columns
- Pagination
- Sub-tabs: Customers, Jobs, Estimates, Leads, Invoices

UltraOffice target:

- Keep customer detail tabs, but make list and detail pages more operational.
- Put next action, active job, open estimate, unpaid invoice, tags, and recent communication at the top.

### Inbox

HCP inbox is a communication hub:

- All Comms
- Customers
- Employees
- AI Team
- Job inbox
- Overview
- Voice call log

UltraOffice target:

- Phone/SMS remain first-class.
- Add a unified Inbox view later for all communications and Jarvis triage.

### Price Book

HCP price book is organized around:

- Services
- Materials
- Pricing forms
- Estimate Templates
- Discounts

UltraOffice target:

- Services = repairs
- Materials = parts
- Equipment = HVAC system matchups
- Discounts = add-ons/promos
- AHRI remains as HVAC-specific proof/workbench
- Estimate presentation templates should become first-class inside this workspace.

### Money

HCP money area uses secondary navigation:

- Payments
- Payouts
- Consumer financing
- Card reader
- Business financing
- Expenses
- Insurance
- Accounting
- Tax
- Settings

UltraOffice target:

- Keep Payments, invoices, financing, and reports together.
- Make payment-related views table-first and action-oriented.

### Settings

HCP settings use a persistent left rail:

- Company
- Billing
- Notifications
- Refer a Friend
- Team & Permissions
- Booking
- Leads
- Communications
- Customer Intake
- Customer Portal
- Estimates
- Invoices
- Jobs
- Marketing Center
- Pipeline
- Price Book
- Service plans
- Checklists
- Job Fields
- Lead Sources
- Tags

Price Book settings include:

- Services
- Labor rates
- Tax Rates
- Materials
- Import/export services
- Bulk price adjuster with increase/decrease, percent, rounding, scope checkboxes, save/cancel

UltraOffice target:

- Admin becomes a side-rail settings workbench.
- Tools/app launcher stays separate from settings.
- Price Book gets dedicated settings for import/export, labor rates, taxes, material defaults, service templates, and bulk price adjustments.

## Implementation Sequence

1. Shell alignment:
   - Add Price Book to primary nav.
   - Rename Quick Quote to Estimates.
   - Rename Pay to Payments.
   - Expand global New menu.

2. Price Book alignment:
   - Rename Catalog to Price Book.
   - Reorder tabs to Services, Materials, Equipment, Discounts, AHRI.
   - Move presentation templates into this workspace.
   - Add settings for import/export, labor, tax, materials, and bulk price adjustment.

3. Tech presentation/cart:
   - Replace tab-heavy cart picker with search/category/list/detail.
   - Let presentation sell first, then attach cart/checkout below.

4. Customer/job records:
   - Standardize left facts rail, top action strip, and tabbed detail area.
   - Keep customer, property, equipment, notes, photos, invoices, estimates, and Jarvis context visible.

5. Dispatch/schedule:
   - Align view controls, filters, unscheduled work, and bulk actions with HCP.
   - Keep HVAC-specific route/cache and ETA features.

6. Settings/App store:
   - Move admin/config pages into a side-nav settings workbench.
   - Group tools by operations, communications, money, catalog, people, automations, integrations.
   - Keep App Store/tools as an apps launcher, separate from settings.

## First Code Changes Started

- `src/components/AppHeader.tsx`
- `src/components/NewItemDropdown.tsx`
- `src/components/NavOrderEditor.tsx`
- `src/hooks/useNavOrder.ts`
- `src/components/workbench/ModuleWorkbench.tsx`
- `src/pages/Customers.tsx`
- `src/pages/Catalog.tsx`
- `docs/housecallpro-layout-reference.md`
