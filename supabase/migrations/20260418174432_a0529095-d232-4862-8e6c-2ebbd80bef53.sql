insert into storage.buckets (id, name, public)
values ('tts-cache', 'tts-cache', true)
on conflict (id) do nothing;

create policy "Public read tts-cache"
on storage.objects for select
using (bucket_id = 'tts-cache');

create policy "Service role write tts-cache"
on storage.objects for insert
to service_role
with check (bucket_id = 'tts-cache');