# Operations Chain Audit - 2026-04-30

## Current Operating Model

The app is now moving toward the right company shape:

- Intake HQ is for talking, texting, listening, and understanding the customer.
- Now HQ is for the action card Jarvis believes needs attention right now.
- Dispatch HQ is for running jobs that are already on the board and seeing live technician context.
- Team HQ is for internal team communication, resources, links, pinned notes, files, and team notifications.

The strongest idea is the same across all four: the human should not track every step manually. Jarvis should watch the workflow and only surface the card that needs human approval, correction, or follow-through.

## What Is Working

- Intake now keeps calls/SMS separate from durable action cards.
- The intake center panel shows call transcript/audio or SMS thread evidence for the selected conversation.
- Dispatch cards now watch technician voice notes, checklists, job attachments, and tech form photos through `useDispatchLiveCards`.
- Now HQ builds workflow cards from jobs, estimates, leads, and pending action items.
- Workflow templates are editable through workflow definitions, and the code already supports workflow-specific action links such as Carrier Enterprise, SIBI Pro, jurisdiction, and permit links.
- Team HQ has rooms, direct messages, files, pins, quick links, resources, and unread notification support.
- Production build passes.

## Silent Failure Risks

1. `workflow_alerts` exist but are not surfaced in Now HQ.
   Current database check found 17 unresolved active workflow alerts, all `blocked`. Now HQ is not querying this table, so workflow failures can exist without appearing on the main action board.

2. Now HQ realtime coverage is incomplete.
   Now HQ subscribes directly to `action_items`, but jobs, estimates, leads, workflow definitions, and workflow alerts can change without instantly refreshing the Now cards.

3. Intake "handled" state is not yet a shared company queue.
   SMS handled/done status lives in `sms_thread_settings`, scoped by `user_id`. That means one dispatcher marking a thread handled may not fully clear it for another dispatcher. Calls are even lighter: they only use read/unread, not a durable handled state.

4. SMS realtime reconnect can fail quietly.
   The SMS hook removes a failed realtime channel and refetches messages, but it does not force a guaranteed resubscribe cycle. A dispatcher could still see periodic data but lose true live updates.

5. Team HQ is still separate from the Now system.
   A team message can contain a blocker like "need permit link" or "customer called back," but there is no first-class "make this a Now card" flow yet.

6. Dispatch live field context is visible but not yet actionable enough.
   Dispatch can see latest tech notes, attachment counts, checklist counts, and Jarvis item counts. The next missing step is turning those updates into updated workflow cards or manager prompts when something needs action.

7. Team audio calls are currently stub links.
   Team HQ audio call support stores and opens a generated link, but the provider is `stub_link`, not a real voice/conference provider.

8. Legacy/open status vocabulary can create false active counts.
   Jobs and estimates are filtered by terminal status lists. If imported records use unexpected statuses, they can still appear active even though the business considers them cleared.

## Team HQ Refinement Direction

Team HQ should adopt the same philosophy as Intake, Now, and Dispatch:

- Team chat stays for conversation.
- Pinned team messages become durable context.
- Internal blockers should be promotable to Now cards.
- Vendor/order/permit/warranty links should be attached to workflow steps, not buried in chat.
- Team HQ should show a small operations signal panel:
  - unread team alerts
  - pinned blockers
  - active internal calls
  - recently shared job links
  - open Now cards that mention team/vendor/permit/order context

## Recommended Fix Order

1. Surface `workflow_alerts` in Now HQ as blocked workflow cards.
2. Add realtime invalidation in Now HQ for jobs, estimates, leads, workflow definitions, and workflow alerts.
3. Create one shared communication-thread status for Intake, covering both SMS and calls, so handled means handled for the company.
4. Harden SMS realtime reconnect with an explicit reconnect counter or shared realtime utility.
5. Add Team HQ operations signals and a "Send to Now" action for team messages.
6. Upgrade Dispatch live cards so tech notes can update or enrich the related Now card.
7. Add visible realtime health indicators for SMS, calls, Team HQ, Dispatch live cards, and Now cards.

## Verification

- `npm run build` passed.
- `npm run lint` now passes with warnings only.
- One SMS webhook lint error was fixed during the audit.
