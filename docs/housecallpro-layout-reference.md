# Housecall Pro Layout Reference

Working goal: use Housecall Pro as the operational layout reference while keeping UltraOffice data, workflows, Jarvis, and presentation/cart logic.

## Authenticated Review Status

Authenticated review completed on April 28, 2026 using the user's logged-in Housecall Pro session. Notes below intentionally avoid customer, employee, payment, contact, and account-specific details. This is a structural UX reference only.

Reviewed areas:

- Home dashboard
- Schedule calendar and dispatch views
- Customers list/workspace
- Inbox/communications
- My Money / payments workspace
- Price Book services, materials, estimate templates, and related tabs
- Reporting workspace
- Apps / marketplace workspace
- Global New menu

## Public Price Book Pattern

Housecall Pro's public help docs show a clear nested price book model:

1. Price Book
2. Services or Materials
3. Industry
4. Category
5. Sub-category
6. Service or material item

Important UX patterns:

- Top-level Price Book entry in primary navigation.
- Left menu inside Price Book for Services and Materials.
- Industry/category cards with images.
- Three-dot overflow menu for edit/delete.
- Add buttons in the upper right of the active level.
- Searchable services with task codes.
- Service detail fields include name, description, task code, image, unit, cost, customer price, taxable flag, online booking, duration, booking type, employee/tag assignment, troubleshooting questions, and favorite flag.
- Flat-rate pricing can attach labor rates and materials.
- Materials can be tracked for job costing without showing as customer-facing line items.
- Import/export exists as a first-class management path.

## UltraOffice Mapping

Use the richer UltraOffice catalog/cart stack as the new default:

- Equipment: `equipment_matchups`
- Repairs/services: `repair_catalog`
- Parts/materials: `parts_catalog`, `part_supply_house_numbers`, `supply_houses`
- Cart/approval/payment: `job_carts`, `job_cart_items`, `refresh_job_cart_pricing`
- Customer presentation: public cart/presentation routes and selected item metadata

Avoid building new UI around the older thin tech pricebook path:

- `service_pricebook`
- `job_repair_items`
- `TechPricebookDrawer`

That path can be bridged or retired after the richer picker is stable.

## Default Operations Shell

Housecall-Pro-style default navigation should be:

- Schedule
- Inbox / Phone
- SMS
- Customers
- Estimates / Presentations
- Price Book
- Payments
- JARVIS
- Admin / Settings

Authenticated HCP shell findings:

- Primary nav is persistent and horizontal.
- Utility cluster stays on the right: global search, New, notifications, apps/tools, account.
- The global New button is the creation hub instead of forcing users to remember which page creates which record.
- Phone is both a primary workspace and a global utility. UltraOffice should keep `/phone` as the calls/voicemail workspace while also exposing a header dialer button that opens the phone console from anywhere.
- Home dashboard is a command center: open estimates, unscheduled jobs, open invoices, employee status, map, recent activity, and upcoming schedule.
- Schedule keeps date controls, employee filters, view selector, bulk actions, and mini calendar near the calendar/dispatch canvas.
- Customers uses a data-table workspace with search, filter, edit columns, create customer, actions, row selection, sortable columns, and pagination.
- Inbox uses sub-tabs for customer, employee, AI team, job inbox, overview, and voice call log.
- Payments uses a secondary left/side menu for payouts, financing, card reader, expenses, insurance, accounting, tax, and settings.
- Price Book has top tabs for Services, Materials, Pricing forms, Estimate Templates, and Discounts.
- Reporting uses a left rail grouped by Business insights, Dashboards, and All Reports. The active report family opens into a dense catalog of report links grouped by dimensions such as date, customer, type, job costing, employee, and line items. The important pattern is not the exact report list; it is the scannable report directory with a clear side rail and top actions for create/report AI.
- Apps uses a marketplace model: tabs for Explore, My apps, and All apps; search and filters at the top; category bands such as HVAC recommendations, grow revenue, manage jobs, get paid, and run your business. This maps well to UltraOffice Admin Tools, because tools should be discoverable by job-to-be-done rather than only by technical category.

UltraOffice shell changes started:

- Add `Price Book` to first-class navigation.
- Rename `Quick Quote` navigation to `Estimates`.
- Rename `Pay` navigation to `Payments`.
- Add `Reporting` as a first-class workbench instead of hiding reports under settings.
- Expand the global New menu to include Job, Estimate, Customer, and Price Book Item.

Future primary navigation target:

- Schedule
- Phone
- SMS
- Customers
- Estimates
- Price Book
- Payments
- Reporting
- JARVIS
- Admin

UltraOffice implementation targets:

- `src/components/AppHeader.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/config/adminNavigation.ts`
- `src/components/MobileShell.tsx`
- `src/components/TechLayout.tsx`
- `src/components/DispatcherLayout.tsx`
- `src/components/AdminLayout.tsx`
- `src/App.tsx`

## Price Book Workspace Direction

Current `Catalog` is tab-first:

- Equipment
- Repairs
- Parts
- AHRI
- Add-ons

Target HCP-style workspace:

- Top tabs or left rail: Services, Materials, Equipment, Add-ons, Estimate Templates, Discounts, AHRI
- Second rail or breadcrumb: industry/category/sub-category
- Main list: dense rows with image/thumb, name, code/model, category, price, member price, status
- Right panel: selected item preview/edit
- Persistent top search
- Upper-right actions: Add, Import, Export, Reorder
- Overflow menus on rows/cards

HCP detail to mirror:

- Services and materials both keep search and category/industry filters visible.
- Estimate templates are managed inside Price Book, not as a separate mental model.
- Price book settings are always reachable from the workspace header.
- Pagination/action controls stay close to the list.

Implementation targets:

- `src/pages/Catalog.tsx`
- `src/components/EquipmentCatalogBrowser.tsx`
- `src/components/RepairCatalogBrowser.tsx`
- `src/components/PartsCatalogBrowser.tsx`
- `src/components/RepairProductCard.tsx`

## Technician Price Book / Cart Direction

The field picker should become the first HCP-style workflow because it directly affects beta testing.

Target flow:

1. Search or browse categories.
2. Tap a service/system/material.
3. Preview customer-safe description, price, member price, warranty/rebate notes.
4. Add to attached cart/presentation.
5. Keep cart summary sticky.
6. Preview presentation/customer view.

Implementation target:

- `src/components/cart/JobCartPicker.tsx`

Keep:

- `useJobCart` as the only cart source of truth.
- Rich metadata snapshots when items are added.
- The new presentation-first equipment picker work.

Change next:

- Replace tab-first add flow with a unified HCP-style search/category/list/detail layout.
- Make repair catalog rows dense and operational, not marketing-card heavy.
- Keep equipment systems presentation-led, but use the same list/detail/cart shell.

## Dispatch / Daily Operations Direction

Use HCP-style density and predictable navigation:

- Dispatch board remains default for office users.
- Job cards should be compact, scannable, and action-oriented.
- Customer/job detail views should use clear sections and stable actions.
- Jarvis stays as a right-side/context assistant, not the navigation model.
- Schedule modes should remain siblings: Schedule, Dispatch, Day, Week, Monday-Friday, Month.
- Filters should be direct and visible: Today, date range, employee, bulk actions, and map/list modes.

Implementation targets:

- `src/pages/Jobs.tsx`
- `src/components/job/DispatchBoard.tsx`
- `src/components/job/JobScheduleCard.tsx`
- `src/pages/TechMySchedule.tsx`
- `src/pages/TechJobDetail.tsx`

## Next Implementation Sequence

1. Finish authenticated HCP review and capture exact navigation/menu patterns.
2. Update desktop `AppHeader` and mobile role tabs to match the operational route model.
3. Build a shared normalized price book item view model.
4. Rework `JobCartPicker` into HCP-style search/category/list/detail with sticky cart summary.
5. Rework `Catalog` into the matching admin price book manager.
6. Bridge or retire the old `service_pricebook` / `TechPricebookDrawer` path.
7. Add screenshots/manual QA across dispatcher desktop and tech mobile.

## Admin / Tools Workspace Direction

HCP settings, reporting, and apps all share one useful pattern: the user starts from a stable workbench, picks a category on the left, then works through a dense list of cards, rows, or links. UltraOffice admin should follow that pattern instead of a decorative icon-only launchpad.

Authenticated HCP Settings detail:

- Left sidebar groups: Global Settings, Feature Configurations, Tags & Tools.
- Global Settings includes Company, Billing, Notifications, Refer a Friend, Team & Permissions.
- Feature Configurations includes Booking, Leads, Communications, Customer Intake, Customer Portal, Estimates, Invoices, Jobs, Marketing Center, Pipeline, Price Book, and Service plans.
- Tags & Tools includes Checklists, Job Fields, Lead Sources, and Tags.
- The selected setting opens in the main pane and may have its own top tabs, such as Company Profile, Business hours, and Service area.
- The important pattern for UltraOffice is stable category navigation first, then focused middle-pane configuration, with any deeper choices as top tabs inside that pane.

Target admin home:

- Workbench header with search, refresh, and alert badges.
- Left rail for All, Create, Tools, Global Settings, Feature Configurations, Tags & Tools, and Activity.
- Marketplace tabs for Explore, My apps, and All apps.
- Scannable tool cards with short descriptions and group labels.
- Operational metrics at the top.
- Recent activity as a secondary section, not the whole page.

Implementation targets:

- `src/components/AdminHub.tsx`
- `src/components/AdminToolsGrid.tsx`
- `src/config/adminNavigation.ts`
- `src/pages/Admin.tsx`
