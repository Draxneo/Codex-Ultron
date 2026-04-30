alter table public.employees
  add column if not exists desktop_calls_enabled boolean not null default false;

comment on column public.employees.desktop_calls_enabled is
  'When true, IVR department routing may ring this employee''s in-app desktop softphone. When false, calls follow normal cell/overflow routing.';
