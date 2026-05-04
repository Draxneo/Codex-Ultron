
# Plan: Replace SendGrid Email System with Gmail Integration

## Architecture (matches your HCP-as-source-of-truth philosophy)

```
   Gmail (clint@cooltechac.com)  ← SOURCE OF TRUTH
        │
        │  every 2 min
        ▼
   gmail-pull cron ────► emails table (overlay/cache)
        │                     │
        │  send via Gmail     ▼
        └────► UI (Inbox, JobDetail, Vendors, Copilot)
                              ▲
                              │ existing 1,861 emails stay
                              │ frozen as historical archive
```

**Rules of the new system:**
- Gmail is canonical. The `emails` table becomes a 2-min-fresh cache.
- Inbound: Gmail → poll → upsert into `emails` table (so all the existing UI, job linking, vendor harvesting, AI categorization keeps working).
- Outbound: app → Gmail API send → Gmail puts it in Sent → next poll picks it up and writes the row.
- Historical 1,845 inbound + 16 outbound emails stay searchable (table not dropped).
- All SendGrid code, secrets, webhooks deleted.

---

## Phase 1 — Connect Gmail (1 step, you do it)

Use the Lovable **Google Mail connector**. One-click OAuth on your business Gmail account. Grants the app these scopes:
- `gmail.readonly` — pull messages
- `gmail.send` — send via your Gmail
- `gmail.modify` — mark as read, archive, label

After you click connect, the app gets a `GOOGLE_MAIL_API_KEY` env var that auto-refreshes its token forever. No API keys for you to manage, no Pub/Sub setup, no Google Cloud Console.

---

## Phase 2 — Build the Gmail Pull Engine

### New edge function: `gmail-pull`
- Calls Gmail API: `users/me/messages?q=newer_than:1d -in:trash` (first run: `newer_than:7d` to backfill recent week)
- Maintains a `gmail_sync_state` table with `last_history_id` so subsequent polls use Gmail's [History API](https://developers.google.com/gmail/api/guides/sync) — only fetches what changed since last poll. Massively cheaper than re-listing.
- For each new message:
  - Fetch full message (`format=full`) to get headers, body, attachments
  - Map Gmail message → existing `emails` row schema:
    - `message_id` ← Gmail `Message-ID` header
    - `thread_id` ← Gmail `threadId`
    - `from_address`, `to_address`, `cc_address`, `subject`, `body_text`, `body_html`, `snippet`, `received_at` ← parsed from headers/payload
    - `is_outbound` ← true if `from_address` matches your Gmail
    - `is_read` ← derived from Gmail `UNREAD` label
    - `is_trash` ← derived from `TRASH` label
    - `attachments` ← array of `{filename, content_type, gmail_attachment_id, size}` (lazy-loaded — we don't download attachment bytes until user clicks them, see Phase 4)
    - **Sets `inbox_type = 'gmail'`** (new value) so historical SendGrid rows can be distinguished from Gmail rows
  - Upsert by `message_id` (idempotent — re-running the cron never duplicates)
  - Run existing classifier (vendor/customer/spam) so the new emails get auto-linked to jobs/vendors just like SendGrid emails did

### New table: `gmail_sync_state`
- `id` (singleton row), `last_history_id`, `last_polled_at`, `last_error`, `consecutive_failures`
- Self-healing: if `consecutive_failures > 3`, fall back to a fresh `newer_than:1d` query and reset history_id

### Cron job
- pg_cron every 2 minutes invokes `gmail-pull`
- Uses `pg_net.http_post` with the project's anon key (existing pattern from `send-job-reminders` etc.)

---

## Phase 3 — Replace Outbound Send (rewrite `email-send`)

Rewrite `supabase/functions/email-send/index.ts` to:
1. Keep the existing HITL queue logic (testing-mode gate, outbound_drafts) untouched — that's good architecture.
2. Replace the `sendViaSendGrid()` call with `sendViaGmail()`:
   - Build RFC 2822 MIME message (To, Cc, Subject, In-Reply-To, References for threading, body)
   - Base64url-encode it
   - POST to `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`
   - Pass `threadId` if replying so Gmail nests it correctly in the thread
3. Don't manually insert the sent row into `emails` — the next `gmail-pull` cycle picks it up from Gmail's Sent folder (single source of truth).

Same approach for `send-brochure-email` (rewrite to use Gmail; attachments encoded as MIME parts inline).

`send-rebate-email`, `cart-send-receipt`, `send-job-reminders`, `daily-lsa-booked-report`, `send-tech-day-digest` — all switched from SendGrid to Gmail send the same way.

---

## Phase 4 — Attachment Handling

Gmail doesn't send attachment bytes in the message list — they're fetched separately by `attachmentId`. New tiny edge function `gmail-attachment` that:
- Takes `{message_id, attachment_id}`
- Calls Gmail `users/me/messages/{id}/attachments/{attachmentId}`
- Returns base64-decoded bytes with the right content-type, OR uploads to Supabase storage and returns a signed URL (cheaper for large/repeated views)

`AttachmentViewer.tsx` updated to call this instead of reading `att.url` (which only existed for SendGrid).

---

## Phase 5 — Mark-Read / Archive / Trash Sync

When a user marks an email read in your app:
1. Update local `emails.is_read = true` (instant UI)
2. Fire-and-forget POST to Gmail's `messages/{id}/modify` with `removeLabelIds: ['UNREAD']`

Same pattern for archive (`removeLabelIds: ['INBOX']`) and trash (`messages/{id}/trash`).

This way Gmail stays in sync — if you read an email on your phone via Gmail app, the next poll marks it read in our app too. Bidirectional.

---

## Phase 6 — Demolition (delete SendGrid code)

Delete entirely:
- `supabase/functions/email-inbound-webhook/` (SendGrid Inbound Parse webhook)
- `supabase/functions/sendgrid-event-webhook/` (delivery/bounce events)
- `supabase/functions/_shared/sendgridHelper.ts`
- All `import …sendgridHelper` lines across ~10 functions
- The `sendgrid_message_id`, `delivery_status` columns on `emails` (optional — can leave them for historical data)
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_INBOUND_HOSTNAME` secrets
- The Lovable Email infrastructure (`process-email-queue`, `email_send_log`, `suppressed_emails` tables, etc.) — none of it gets used anymore. **Will ask you to confirm before dropping these tables** because they're foundational and irreversible.

UI stays mostly as-is — `InboxPage.tsx`, `EmailDetailView.tsx`, `EmailCompose.tsx`, `useEmails.ts` already query the `emails` table, which keeps working. Only changes:
- `EmailCompose.tsx` `handleSend` — already calls `email-send` edge function, which now sends via Gmail. **No UI change needed.**
- `EmailHealth.tsx` page — repurposed to show Gmail sync status (last poll, history_id, errors) instead of SendGrid delivery stats. Or deleted if you don't care.

---

## Phase 7 — Historical Data (the 1,861 SendGrid emails)

- Add `inbox_type` filter on `inbox_type IN ('gmail', NULL)` for the live inbox view (NULL = historical SendGrid rows, treated as read-only archive).
- Add a small "Archive" toggle in the inbox sidebar to flip to historical SendGrid view if you ever need to dig up an old conversation.
- Job/customer/vendor links on historical rows keep working — they're already in the DB.

---

## What changes for you, the user

| Before | After |
|---|---|
| Emails sent from app come from `notify@cooltechac.com` (SendGrid) | Emails sent from app come from **your real Gmail address** — recipient sees them as if you typed them in Gmail |
| Replies go to a SendGrid inbound webhook → app inbox only | Replies go to **your Gmail inbox** — visible in Gmail mobile app, Gmail web, AND the app inbox (within 2 min) |
| Sent items only exist in the `emails` table | Sent items live in **Gmail Sent folder** — searchable from any Gmail client |
| If app/SendGrid is down, mail flow breaks | If app is down, **Gmail keeps working** — emails just don't show in app until it's back |
| 0 emails per day cost via SendGrid free tier (limited) | Free up to Gmail's normal limits (500 sends/day for personal, 2000/day for Workspace — way more than you need) |

---

## Files Touched (estimate)

**Delete (~6 files + shared helper):**
- `supabase/functions/email-inbound-webhook/`
- `supabase/functions/sendgrid-event-webhook/`
- `supabase/functions/_shared/sendgridHelper.ts`

**Rewrite (~7 send-related functions):**
- `email-send`, `send-brochure-email`, `send-rebate-email`, `cart-send-receipt`, `send-job-reminders`, `daily-lsa-booked-report`, `send-tech-day-digest` — swap SendGrid call for Gmail send helper

**Create (~3 new functions + 1 helper + 1 table):**
- `gmail-pull` (cron-driven inbound puller)
- `gmail-attachment` (lazy attachment fetcher)
- `gmail-modify` (read/archive/trash sync — or fold into `gmail-pull`)
- `_shared/gmailHelper.ts` (gateway URL + MIME builder + send/list/modify wrappers)
- `gmail_sync_state` table + 1 migration

**Light edits (~6 UI files):**
- `useEmails.ts` — add `inbox_type` filter for live vs archive view, hook up mark-read/archive/trash to fire Gmail-modify
- `AttachmentViewer.tsx` — fetch via `gmail-attachment` for new emails
- `EmailHealth.tsx` — repurpose or delete
- `EmailCompose.tsx` — minor (no behavior change, just attachment encoding tweak)

**Untouched:** `InboxPage.tsx`, `EmailDetailView.tsx`, `EmailSidebar.tsx`, `EmailThreadList.tsx`, all jobs/vendors/inbox UI, AI categorization, vendor harvesting, copilot suggestions — they all keep working because the `emails` table contract stays the same.

---

## Order of Operations (Implementation)

1. ✅ Connect Google Mail connector (you click button, ~30 sec)
2. Build `gmailHelper.ts`, `gmail-pull`, `gmail_sync_state` table → manual test pull → confirm new emails appear
3. Schedule the 2-min cron
4. Rewrite `email-send` to use Gmail → test sending one email → verify it appears in your Gmail Sent folder
5. Rewrite the other 6 send functions
6. Build `gmail-attachment` + wire into `AttachmentViewer`
7. Wire mark-read/archive/trash to `gmail-modify`
8. Delete SendGrid code, remove secrets
9. Add `inbox_type` historical-archive toggle in UI

Once you approve, I'll start with steps 2–4 (the high-value path — pull + send working) and then do the cleanup. **Total work: probably 3 implementation rounds.**

---

## One thing I need you to confirm before starting

The Lovable Email queue tables (`email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`, pgmq queues, the `process-email-queue` cron job) — these are the "Lovable Cloud Emails" subsystem, **separate from SendGrid**. You don't appear to actually use them based on the code I scanned, but dropping them is destructive. Options:

**A.** Leave them in place, dormant — zero risk, takes a tiny bit of DB space
**B.** Drop them all in a migration — clean slate, cannot be reversed without re-scaffolding

I'll default to **A** unless you say otherwise.
