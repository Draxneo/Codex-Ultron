-- Multi-company communications foundation.
-- One app can now host separate brands/phone numbers while sharing the
-- customer database and operational UI.

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  legal_name text,
  primary_phone_number text not null,
  customer_tag text not null,
  stripe_account_id text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_units_one_default_idx
  on public.business_units (is_default)
  where is_default = true;

create unique index if not exists business_units_primary_phone_digits_idx
  on public.business_units ((right(regexp_replace(primary_phone_number, '\D', '', 'g'), 10)))
  where is_active = true;

alter table public.business_units enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_units'
      and policyname = 'authenticated read business units'
  ) then
    create policy "authenticated read business units"
      on public.business_units for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_units'
      and policyname = 'admins manage business units'
  ) then
    create policy "admins manage business units"
      on public.business_units for all
      to authenticated
      using (public.has_role(auth.uid(), 'admin'::app_role))
      with check (public.has_role(auth.uid(), 'admin'::app_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_units'
      and policyname = 'anon read active business units'
  ) then
    create policy "anon read active business units"
      on public.business_units for select
      to anon
      using (is_active = true);
  end if;
end $$;

insert into public.business_units (
  slug,
  display_name,
  legal_name,
  primary_phone_number,
  customer_tag,
  is_default
) values (
  'carnes',
  'Carnes and Sons',
  'Carnes and Sons Air Conditioning',
  '+12106005091',
  'Carnes and Sons',
  true
) on conflict (slug) do update set
  display_name = excluded.display_name,
  legal_name = excluded.legal_name,
  primary_phone_number = excluded.primary_phone_number,
  customer_tag = excluded.customer_tag,
  is_default = true,
  updated_at = now();

insert into public.business_units (
  slug,
  display_name,
  legal_name,
  primary_phone_number,
  customer_tag,
  is_default
) values (
  'fix-construction',
  'FIX Construction',
  'FIX Construction',
  '+12106005671',
  'FIX Construction',
  false
) on conflict (slug) do update set
  display_name = excluded.display_name,
  legal_name = excluded.legal_name,
  primary_phone_number = excluded.primary_phone_number,
  customer_tag = excluded.customer_tag,
  updated_at = now();

alter table public.ivr_config
  add column if not exists business_unit_id uuid references public.business_units(id),
  add column if not exists label text,
  add column if not exists inbound_phone_number text,
  add column if not exists is_default boolean not null default false;

update public.ivr_config c
set
  business_unit_id = coalesce(c.business_unit_id, b.id),
  label = coalesce(c.label, b.display_name),
  inbound_phone_number = b.primary_phone_number,
  is_default = true
from public.business_units b
where b.slug = 'carnes'
  and c.business_unit_id is null
  and c.id = (
    select existing.id
    from public.ivr_config existing
    where existing.business_unit_id is null
    order by existing.is_default desc, existing.created_at asc
    limit 1
  );

create unique index if not exists ivr_config_business_unit_unique_idx
  on public.ivr_config (business_unit_id);

create unique index if not exists ivr_config_inbound_phone_digits_idx
  on public.ivr_config ((right(regexp_replace(inbound_phone_number, '\D', '', 'g'), 10)))
  where inbound_phone_number is not null;

alter table public.ivr_menu_options
  add column if not exists ivr_config_id uuid references public.ivr_config(id) on delete cascade;

update public.ivr_menu_options o
set ivr_config_id = (
  select c.id
  from public.ivr_config c
  where c.is_default = true
  order by c.created_at asc
  limit 1
)
where o.ivr_config_id is null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ivr_menu_options_digit_key'
      and conrelid = 'public.ivr_menu_options'::regclass
  ) then
    alter table public.ivr_menu_options drop constraint ivr_menu_options_digit_key;
  end if;
end $$;

create unique index if not exists ivr_menu_options_config_digit_unique_idx
  on public.ivr_menu_options (ivr_config_id, digit);

alter table public.call_log
  add column if not exists business_unit_id uuid references public.business_units(id),
  add column if not exists called_number text;

alter table public.sms_log
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.customers
  add column if not exists primary_business_unit_id uuid references public.business_units(id);

create index if not exists call_log_business_unit_id_idx on public.call_log(business_unit_id);
create index if not exists sms_log_business_unit_id_idx on public.sms_log(business_unit_id);
create index if not exists customers_primary_business_unit_id_idx on public.customers(primary_business_unit_id);

-- Seed a separate FIX Construction IVR that admins can edit immediately.
insert into public.ivr_config (
  business_unit_id,
  label,
  inbound_phone_number,
  greeting_text,
  voicemail_greeting,
  after_hours_greeting,
  ring_timeout_seconds,
  voicemail_enabled,
  is_default
)
select
  b.id,
  'FIX Construction',
  b.primary_phone_number,
  'Thank you for calling FIX Construction. Please press 1 for service or quotes.',
  'Please leave a message after the tone and FIX Construction will return your call.',
  'Thank you for calling FIX Construction. We are currently closed. Please leave a message after the tone.',
  25,
  true,
  false
from public.business_units b
where b.slug = 'fix-construction'
on conflict (business_unit_id) do update set
  label = excluded.label,
  inbound_phone_number = excluded.inbound_phone_number,
  updated_at = now();

insert into public.ivr_menu_options (
  ivr_config_id,
  digit,
  label,
  action_type,
  forward_to,
  sort_order,
  is_active,
  routing_department_key,
  inbound_route_mode
)
select
  c.id,
  '1',
  'Service / Quotes',
  'forward_client',
  'softphone',
  0,
  true,
  'service',
  'cell_forwarding'
from public.ivr_config c
join public.business_units b on b.id = c.business_unit_id
where b.slug = 'fix-construction'
on conflict (ivr_config_id, digit) do update set
  label = excluded.label,
  action_type = excluded.action_type,
  forward_to = excluded.forward_to,
  routing_department_key = excluded.routing_department_key,
  updated_at = now();
