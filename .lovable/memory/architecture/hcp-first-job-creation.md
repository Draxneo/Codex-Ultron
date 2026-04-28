---
name: UltraOffice-First Job Creation
description: New job/estimate creation writes to UltraOffice2.0 first. HCP remains transition-only for imports, history, and emergency comparison.
type: feature
---
## UltraOffice-First Architecture
All new booking/creation flows (JARVIS action cards, CSR intake, Book It Now popups, manual dispatch actions) should write to the UltraOffice2.0 database first:
1. Resolve or create the local customer.
2. Create the local job or estimate.
3. Schedule and assign inside UltraOffice2.0.
4. Add AI/customer context as local notes/action items.
5. Let What's Next track the remaining human-in-the-loop work.

HCP is transition-only. HCP import/sync functions may pull history or scheduled work while we finish cutover, but they should not be the default path for new work.

**Do not build new HCP-first flows.** The source of truth is Supabase project `tqkqqjvddfrcxrxfvzvz`.

Frontend components using this: `ActionItemCards`, `BookingIntentAlert`, `IntakeActionCards`.
