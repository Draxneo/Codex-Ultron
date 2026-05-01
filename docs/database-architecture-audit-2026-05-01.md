# Database Architecture Audit - 2026-05-01

## Plain-English Answer

The database is not too large right now. The bigger issue is iteration drift: we have the current app tables, protected Housecall Pro import tables, future workflow tables, cache/runtime tables, and a few old parallel feature tables all living beside each other.

The right move is not to merge everything into fewer tables. The right move is:

1. Keep core business records normalized.
2. Build fast views/RPCs for headquarters screens.
3. Expire runtime/cache tables automatically.
4. Protect Housecall Pro import data until reconciliation is finished.
5. Mark future/unused tables so Jarvis does not treat them like current truth.
6. Merge only the few areas that are genuinely duplicated.

## Current Table Fit

After the app-fit classification pass:

- Current app tables: 119
- Runtime/cache/temporary tables: 24
- Future/placeholder workflow tables: 19
- Protected Housecall Pro import tables: 5
- Merge candidates: 5
- Needs human review: 4
- Archive table: 1

## Biggest Tables

The largest tables are expected:

- `hcp_raw_objects` - protected Housecall Pro raw import, 76 MB
- `hcp_attachments` - protected Housecall Pro attachment metadata, 23 MB
- `job_attachments` - current job media, 21 MB
- `jobs` - current work orders, 14 MB
- `estimates` - current and imported estimate history, 12 MB
- `knowledge_chunks` - Jarvis knowledge/RAG content, about 7 MB

These are not runaway sizes. They are reasonable for the amount of imported history and media metadata.

## Do Not Merge

These should stay separate because they are different business facts:

- `customers`, `customer_addresses`, `jobs`, `estimates`
- `customer_invoices`, `customer_invoice_items`, `invoice_payments`, `stripe_events`
- `call_log`, `sms_log`, `voicemails`
- `job_attachments`, `tech_form_photos`, `preinstall_photos`
- `workflow_definitions`, `action_items`, `workflow_alerts`

Merging these into one big table would make writes simpler for a minute but reporting, security, search, cleanup, and Jarvis context worse.

## Build Views Instead

For speed and simplicity, the app should use dashboard-specific views/RPCs:

- `v_unified_communications`: calls + texts + voicemails for Intake.
- `v_customer_timeline`: jobs + calls + texts + estimates + invoices + attachments for Customer HQ.
- `v_dispatch_live_cards`: today’s jobs + tech updates + attachments + NOW status for Dispatch.
- `v_job_financial_summary`: job + estimate + invoice + payment status.
- `v_tech_work_summary`: tech forms + photos + voice summaries + line items.
- `v_quote_pipeline`: outstanding estimates + follow-up state + customer communication.

This keeps the database organized while making screens fast.

## Merge Candidates

The main real duplication is team communications:

- `chat_channels`
- `chat_huddles`
- `chat_messages`
- `chat_reactions`
- `chat_read_cursors`

These appear to overlap with the newer `team_*` tables. Recommended path:

1. Pick `team_conversations`, `team_conversation_members`, and `team_messages` as the likely canonical Team HQ path.
2. Migrate any useful `chat_*` history into `team_*`.
3. Archive old `chat_*`.
4. Remove the UI/code path that writes to `chat_*`.

## Future Tables

These are useful roadmap tables but should not drive daily workflow yet:

- Warranty and permit workflow tables.
- Meta/referral/marketing tables.
- Vendor ordering tables that are not fully wired.
- Weather SMS campaign table.

These should stay visible in Control Room, but Jarvis should treat them as non-authoritative until the workflow is actually wired end to end.

## Label Bugs Fixed

The first automated labeling pass had a couple of false matches:

- `invoice` got caught by `voice`, so invoice tables looked like phone tables.
- `catalog` got caught by `log`, so catalog tables looked like log tables.
- `repair_catalog` was mistakenly caught by a loose AI/Jarvis match.

Those labels are now corrected with explicit classifications.

## Recommendation

Keep the 177-table schema for now. That sounds like a lot, but most tables are small and category-specific. The next cleanup should not be “combine tables.” It should be:

1. Create canonical views for headquarters screens.
2. Make Jarvis read those views instead of poking at many raw tables.
3. Resolve the `chat_*` vs `team_*` duplicate path.
4. Keep Housecall Pro import protected until missing-job/date reconciliation is done.
5. Add lifecycle cleanup only to runtime/cache/temporary tables.

That gives us one source of truth without flattening the database into a mess.
