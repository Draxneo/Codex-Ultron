-- Expire Walter's stale pending reminder (scheduled_for was yesterday)
UPDATE job_reminders SET status = 'expired' WHERE job_id = '1f88afb2-7d5a-4f0d-998a-f55778b018e1' AND status = 'pending';

-- Close the stale action_item card showing Walter
UPDATE action_items SET status = 'done', resolved_at = NOW() WHERE id = '1c9599a3-1829-42f8-b32f-54d6b6ced6be' AND status = 'open';