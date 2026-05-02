alter table public.department_forwarding_numbers
  add column if not exists ivr_config_id uuid references public.ivr_config(id) on delete cascade;

update public.department_forwarding_numbers d
set ivr_config_id = c.id
from public.ivr_config c
join public.business_units b on b.id = c.business_unit_id
where d.ivr_config_id is null
  and b.slug = 'carnes';

create index if not exists idx_department_forwarding_numbers_ivr_department
  on public.department_forwarding_numbers (ivr_config_id, department_key, enabled, priority);
