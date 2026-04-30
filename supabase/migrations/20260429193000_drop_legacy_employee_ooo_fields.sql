alter table public.employees
  drop column if exists ooo_enabled,
  drop column if exists ooo_forward_number;

delete from public.company_settings
where key in ('call_forwarding_enabled', 'call_forwarding_number');
