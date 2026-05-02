update public.business_units
set document_logo_url = 'https://www.carnesandsons.com/favicon.png',
    updated_at = now()
where slug = 'carnes';

insert into public.company_settings (key, value, updated_at)
values ('company_logo_url', 'https://www.carnesandsons.com/favicon.png', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
