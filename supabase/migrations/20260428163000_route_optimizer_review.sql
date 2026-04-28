create table if not exists public.route_optimization_runs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  dispatcher_id uuid,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.route_optimization_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.route_optimization_runs(id) on delete cascade,
  technician_id uuid,
  job_id uuid references public.jobs(id) on delete set null,
  current_order integer,
  suggested_order integer not null,
  current_start_time text,
  suggested_start_time text,
  locked boolean not null default false,
  flexibility_reason text,
  optimization_reason text,
  warning text,
  created_at timestamptz not null default now()
);

create table if not exists public.route_sms_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.route_optimization_runs(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  phone_number text,
  message_type text not null default 'morning_order_update',
  message_body text not null,
  status text not null default 'draft',
  approved_by uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.route_optimization_runs enable row level security;
alter table public.route_optimization_suggestions enable row level security;
alter table public.route_sms_queue enable row level security;

create policy "Authenticated users can manage route optimization runs"
  on public.route_optimization_runs for all to authenticated
  using (true) with check (true);

create policy "Authenticated users can manage route optimization suggestions"
  on public.route_optimization_suggestions for all to authenticated
  using (true) with check (true);

create policy "Authenticated users can manage route sms queue"
  on public.route_sms_queue for all to authenticated
  using (true) with check (true);
