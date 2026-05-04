
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz default now(),
  unique(user_id, token)
);
alter table public.push_tokens enable row level security;
create policy "Users manage own tokens" on public.push_tokens
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
