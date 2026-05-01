-- Speed up the headquarters paths that repeatedly join or filter by these IDs.
-- These are plain FK/support indexes, not data-model changes.

create index if not exists idx_activity_log_job_id
  on public.activity_log(job_id);

create index if not exists idx_action_items_resolved_by
  on public.action_items(resolved_by)
  where resolved_by is not null;

create index if not exists idx_customer_invoices_job_id
  on public.customer_invoices(job_id)
  where job_id is not null;

create index if not exists idx_customer_invoice_items_invoice_id
  on public.customer_invoice_items(invoice_id);

create index if not exists idx_copilot_messages_session_id
  on public.copilot_messages(session_id);

create index if not exists idx_chat_messages_channel_id
  on public.chat_messages(channel_id);

create index if not exists idx_tech_location_events_employee_id
  on public.tech_location_events(employee_id)
  where employee_id is not null;
