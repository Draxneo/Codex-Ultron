alter table public.employees
  add column if not exists softphone_route_ready boolean not null default false,
  add column if not exists softphone_last_seen timestamptz,
  add column if not exists softphone_surface text;

create index if not exists employees_softphone_route_ready_idx
  on public.employees (desktop_calls_enabled, softphone_route_ready, softphone_last_seen)
  where is_active = true;

comment on column public.employees.desktop_calls_enabled is
  'User preference: this employee wants calls to ring their desktop/app when the softphone is actually online.';

comment on column public.employees.softphone_route_ready is
  'Live heartbeat from the softphone. Inbound IVR routes only ring desktop/app when this is true and recent.';

comment on column public.employees.softphone_last_seen is
  'Last time the softphone reported it was registered and able to receive calls.';

comment on column public.employees.softphone_surface is
  'Where the live softphone heartbeat came from, such as electron, web, or android.';
