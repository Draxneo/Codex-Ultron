create table if not exists public.subcontractor_job_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  job_id uuid not null references public.jobs(id) on delete cascade,
  subcontractor_name text,
  subcontractor_phone text,
  scope text,
  equipment_summary text,
  required_photo_slots text[] not null default array['before', 'after']::text[],
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.subcontractor_job_links enable row level security;

drop policy if exists "Staff can manage subcontractor links" on public.subcontractor_job_links;
create policy "Staff can manage subcontractor links"
  on public.subcontractor_job_links
  for all
  to authenticated
  using (true)
  with check (true);

create index if not exists idx_subcontractor_job_links_job
  on public.subcontractor_job_links(job_id, created_at desc);

create or replace function public.create_subcontractor_job_link(
  p_job_id uuid,
  p_subcontractor_name text default null,
  p_subcontractor_phone text default null,
  p_scope text default null,
  p_equipment_summary text default null,
  p_required_photo_slots text[] default null,
  p_expires_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.subcontractor_job_links;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.subcontractor_job_links (
    job_id,
    subcontractor_name,
    subcontractor_phone,
    scope,
    equipment_summary,
    required_photo_slots,
    expires_at,
    created_by
  )
  values (
    p_job_id,
    nullif(trim(coalesce(p_subcontractor_name, '')), ''),
    nullif(trim(coalesce(p_subcontractor_phone, '')), ''),
    nullif(trim(coalesce(p_scope, '')), ''),
    nullif(trim(coalesce(p_equipment_summary, '')), ''),
    coalesce(p_required_photo_slots, array['before', 'after']::text[]),
    now() + make_interval(days => greatest(coalesce(p_expires_days, 14), 1)),
    auth.uid()
  )
  returning * into v_link;

  return jsonb_build_object(
    'id', v_link.id,
    'token', v_link.token,
    'path', '/subcontractor/' || v_link.token,
    'expires_at', v_link.expires_at
  );
end;
$$;

create or replace function public.get_public_subcontractor_job(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_photos jsonb;
begin
  select
    l.*,
    j.job_number,
    j.hcp_job_number,
    j.customer_name,
    j.address,
    j.scheduled_date,
    j.arrival_start,
    j.arrival_end,
    j.description,
    j.job_type
  into v_link
  from public.subcontractor_job_links l
  join public.jobs j on j.id = l.job_id
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  update public.subcontractor_job_links
  set last_viewed_at = now()
  where id = v_link.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ja.id,
    'file_name', ja.file_name,
    'file_path', ja.file_path,
    'file_type', ja.file_type,
    'category', ja.category,
    'created_at', ja.created_at
  ) order by ja.created_at desc), '[]'::jsonb)
  into v_photos
  from public.job_attachments ja
  where ja.job_id = v_link.job_id
    and ja.category like 'subcontractor_%';

  return jsonb_build_object(
    'token', v_link.token,
    'job_id', v_link.job_id,
    'job_number', coalesce(v_link.job_number, v_link.hcp_job_number),
    'customer_name', v_link.customer_name,
    'address', v_link.address,
    'scheduled_date', v_link.scheduled_date,
    'arrival_start', v_link.arrival_start,
    'arrival_end', v_link.arrival_end,
    'job_type', v_link.job_type,
    'scope', coalesce(v_link.scope, v_link.description),
    'equipment_summary', v_link.equipment_summary,
    'subcontractor_name', v_link.subcontractor_name,
    'required_photo_slots', v_link.required_photo_slots,
    'completed_at', v_link.completed_at,
    'expires_at', v_link.expires_at,
    'photos', v_photos
  );
end;
$$;

create or replace function public.submit_subcontractor_job_photo(
  p_token text,
  p_photo_slot text,
  p_file_name text,
  p_file_path text,
  p_file_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.subcontractor_job_links;
  v_attachment public.job_attachments;
  v_slot text := lower(regexp_replace(coalesce(p_photo_slot, 'general'), '[^a-z0-9_-]+', '_', 'g'));
begin
  select *
  into v_link
  from public.subcontractor_job_links
  where token = p_token
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'This subcontractor link is expired or invalid';
  end if;

  if p_file_path is null or p_file_path not like ('subcontractor/' || p_token || '/%') then
    raise exception 'Invalid upload path';
  end if;

  insert into public.job_attachments (
    job_id,
    file_name,
    file_path,
    file_type,
    category,
    hidden_from_tech_share
  )
  values (
    v_link.job_id,
    coalesce(nullif(trim(p_file_name), ''), 'Subcontractor photo'),
    p_file_path,
    p_file_type,
    'subcontractor_' || v_slot,
    false
  )
  returning * into v_attachment;

  insert into public.activity_log(job_id, action, details, performed_by)
  values (
    v_link.job_id,
    'subcontractor_photo_uploaded',
    'Subcontractor uploaded ' || v_slot || ' photo: ' || coalesce(v_attachment.file_name, v_attachment.file_path),
    coalesce(v_link.subcontractor_name, 'Subcontractor')
  );

  return jsonb_build_object(
    'id', v_attachment.id,
    'file_path', v_attachment.file_path,
    'category', v_attachment.category
  );
end;
$$;

create or replace function public.mark_subcontractor_job_complete(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.subcontractor_job_links;
begin
  update public.subcontractor_job_links
  set completed_at = coalesce(completed_at, now())
  where token = p_token
    and revoked_at is null
    and expires_at > now()
  returning * into v_link;

  if not found then
    raise exception 'This subcontractor link is expired or invalid';
  end if;

  insert into public.activity_log(job_id, action, details, performed_by)
  values (
    v_link.job_id,
    'subcontractor_marked_complete',
    'Subcontractor marked the work complete',
    coalesce(v_link.subcontractor_name, 'Subcontractor')
  );

  return jsonb_build_object('completed_at', v_link.completed_at);
end;
$$;

grant execute on function public.create_subcontractor_job_link(uuid, text, text, text, text, text[], integer) to authenticated;
grant execute on function public.get_public_subcontractor_job(text) to anon, authenticated;
grant execute on function public.submit_subcontractor_job_photo(text, text, text, text, text) to anon, authenticated;
grant execute on function public.mark_subcontractor_job_complete(text) to anon, authenticated;
