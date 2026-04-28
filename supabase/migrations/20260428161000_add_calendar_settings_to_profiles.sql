alter table public.profiles
  add column if not exists calendar_settings jsonb;

comment on column public.profiles.calendar_settings is
  'Per-user dispatch calendar settings: business hours, holidays, card density, and visible card fields.';
