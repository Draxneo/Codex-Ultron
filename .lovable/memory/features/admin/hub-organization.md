---
name: Hub Organization
description: Unified Admin hub with categorized settings + centralized EmployeeHub sub-tabs
---
Admin Hub (`/admin`) uses an icon-grid landing for both desktop and mobile:
- **Landing**: `AdminHub.tsx` — Quick Actions, Metrics, Tools & Builders, then **Settings grouped into 4 categories**: 👥 People, 📞 Communications, 💰 Money, ⚙️ System.
- **Drill-down**: Tap a settings icon → `/admin?section=<key>` with back arrow, no sidebar.

**Employee Hub** (`/admin?section=employees`, also `?section=team` legacy alias):
- Component: `src/components/admin/EmployeeHub.tsx`
- 5 sub-tabs: Roster · Permissions · Pay · Schedules (placeholder) · Activity (placeholder)
- Roster groups employees by canonical role (admin/office/supervisor/tech/installer)
- Permissions tab embeds `PageAccessCard` + `ViewAsCard`
- Pay tab embeds `PayRatesCard` + `TimeTrackerCard` + `PaysheetPanel`
- Replaces the legacy `TeamSection` + standalone Pay section in Admin.tsx

**Canonical roles enforced**: DB CHECK constraint `employees_role_canonical_check` restricts `employees.role` to exactly: admin, office, supervisor, tech, installer. ROLE_OPTIONS in Admin.tsx mirrors this.
