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

## Canonical Read Model Pass

Migration `20260501213000_canonical_operations_read_models.sql` adds the first source-of-truth read windows:

- `v_unified_communications`
- `get_unified_communications(limit, offset, view, search)`
- `v_customer_timeline`
- `v_dispatch_live_cards`
- `v_quote_pipeline`
- `v_tech_work_summary`
- `mark_intake_communication_handled(...)`

These are read windows, not new places to store facts. Calls still live in `call_log`, texts still live in `sms_log`, jobs still live in `jobs`, quotes still live in `estimates`, and technician files still live in the attachment/form tables. The point is that Intake, NOW, Dispatch, Customer HQ, Quote HQ, Tech, and Jarvis can all read the same clean story instead of rebuilding it differently on every screen.

Do not use these views for blind whole-database totals. Use recent/filtered reads or the communication RPC. Big dashboard counts should use small purpose-built count queries so the owner dashboard stays fast.

## Intake Wiring Pass

Commit `f462e12` starts moving Intake and Jarvis onto the communication read model:

- Intake now loads `get_unified_communications(...)` through `useUnifiedCommunications`.
- Existing call and SMS controls remain in place so sending, reading, and replying do not change behavior.
- Intake cards are enriched with the canonical source row when one exists.
- Marking a card handled now uses `mark_intake_communication_handled(...)` instead of hand-writing a status row from the screen.
- Jarvis context receives the canonical communication id/source/job/customer context when the operator asks Jarvis about a selected call or text.
- `jarvis-context-builder` now prefers `get_unified_communications(...)` for recent call/text history, with a fallback to the older raw reads if the read model fails.

This is the correct transition pattern: the UI can keep working while the source-of-truth read path is centralized underneath it.

## Headquarters Wiring Pass

The next wiring pass added reusable frontend hooks for the read models:

- `useQuotePipeline(...)` / `useQuotePipelineMap(...)`
- `useCustomerTimeline(...)`
- `useTechWorkSummary(...)`

Dispatch HQ live cards now enrich their existing field-update context with `v_dispatch_live_cards`, so the card can see canonical status, recent customer communication, and workflow alerts without each screen rebuilding that logic.

Quote HQ now overlays `v_quote_pipeline` on top of the existing quote controls. The page still uses the current estimate actions, but Jarvis and the operator see the shared pipeline stage and latest communication signal.

Customer HQ now shows a customer timeline sourced from `v_customer_timeline`, combining calls, texts, jobs, estimates, invoices, and attachments into one relationship story.

Tech job screens now use `v_tech_work_summary` through `useTechWorkSummary(...)`, so the technician, dispatch board, and Jarvis all see the same next-step signal, photo/file count, and quote count.

Now HQ quote cards now overlay `v_quote_pipeline`, so open quote cards carry the same customer/contact/latest-message context as Quote HQ instead of rebuilding quote context separately.

## Team HQ Wiring Pass

Team HQ is using the newer `team_*` tables as the active internal communication path:

- `team_conversations`
- `team_conversation_members`
- `team_messages`
- `team_audio_calls`
- `team_notifications`

The app now makes the Team-to-Now handoff visible in Team HQ. When a team message is sent to Now, Team HQ shows that the message was already escalated and links back to the Now action card. The right rail also lists Now cards created from the current team conversation.

This keeps internal team chatter out of Intake while still allowing important team messages to become actionable workflow cards.

## Direct Data Path Audit - First Findings

The main active headquarters paths now have shared read hooks:

- Intake: `useUnifiedCommunications(...)` / `get_unified_communications(...)`
- Dispatch: `useDispatchLiveCards(...)` / `v_dispatch_live_cards`
- Quote HQ: `useQuotePipeline(...)` / `v_quote_pipeline`
- Customer HQ: `useCustomerTimeline(...)` / `v_customer_timeline`
- Tech job view: `useTechWorkSummary(...)` / `v_tech_work_summary`
- Now HQ: workflow/action-item builders plus quote-pipeline enrichment

Remaining direct reads are not all bad. Some are mutation screens or admin tools that should write to the base tables. The cleanup rule is:

- Keep direct writes where the screen is truly editing the record.
- Move dashboard/read-only context behind canonical hooks/views.
- Avoid giving Jarvis old raw-table paths when a canonical read model exists.

The biggest old parallel communication path is still `chat_*`. It appears mostly unused by the current Team HQ. The active app path has now been moved toward `team_*`:

- `src/hooks/useChat.ts` and `src/hooks/useChatNotifications.ts` were removed because nothing imported them.
- `src/pages/TechFormPublic.tsx` no longer writes new tech completion notices into `chat_messages`; the office-facing signal is `activity_log` plus shared job read models.
- Jarvis canonical tools now use `read_team_messages` / `send_team_message`.
- `read_chat_messages` / `send_chat_message` are marked retired and disabled by migration `20260501224500_retire_legacy_chat_tools.sql`.

Recommended next step: migrate useful `chat_*` history into `team_*`, or leave it archived as read-only history. New app features should write to `team_*`, `activity_log`, or `action_items` depending on whether they are a chat message, a job event, or a true Now action.

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
