-- Priority 4 JARVIS drift cleanup:
-- - normalize legacy/reminder/JARVIS action_items.status = 'open' to 'pending'
-- - keep future JARVIS/reminder inserts aligned with the pending queue

update public.action_items
set status = 'pending'
where status = 'open'
  and (
    source in ('jarvis', 'sms')
    or category in (
      'jarvis_action_approval',
      'reminder_batch',
      'confirmation',
      'reschedule',
      'follow_up',
      'new_appointment'
    )
  );

create or replace function public.normalize_jarvis_action_item_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'open'
    and (
      new.source in ('jarvis', 'sms')
      or new.category in (
        'jarvis_action_approval',
        'reminder_batch',
        'confirmation',
        'reschedule',
        'follow_up',
        'new_appointment'
      )
    )
  then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_jarvis_action_item_status on public.action_items;

create trigger trg_normalize_jarvis_action_item_status
before insert or update of status, source, category on public.action_items
for each row
execute function public.normalize_jarvis_action_item_status();
