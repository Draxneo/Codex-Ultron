create table if not exists public.job_team_members (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  role text not null default 'helper',
  is_primary boolean not null default false,
  added_by uuid null,
  added_at timestamptz not null default now(),
  unique (job_id, employee_name)
);

create index if not exists idx_job_team_members_job_id
  on public.job_team_members(job_id);

create index if not exists idx_job_team_members_employee_id
  on public.job_team_members(employee_id);

alter table public.job_team_members enable row level security;

drop policy if exists "Authenticated users can manage job team members" on public.job_team_members;

create policy "Authenticated users can manage job team members"
  on public.job_team_members
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.job_team_members is
  'Additional people attached to a job. jobs.assigned_to remains the primary owner.';
