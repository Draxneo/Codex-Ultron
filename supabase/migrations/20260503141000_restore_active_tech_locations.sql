-- Tech live locations are part of the active technician GPS/dispatch flow.
-- Some remote history placeholders left this table absent while code still uses it.

create table if not exists public.tech_locations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed double precision,
  accuracy double precision,
  updated_at timestamptz not null default now()
);

alter table public.tech_locations enable row level security;

drop policy if exists "Authenticated full access" on public.tech_locations;
create policy "Authenticated full access" on public.tech_locations
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tech_locations'
  ) then
    alter publication supabase_realtime add table public.tech_locations;
  end if;
end $$;
