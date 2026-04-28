-- UltraOffice2.0 is now the source of truth. Remove old hosted-app handoff defaults.

insert into public.company_settings (key, value, updated_at)
values
  ('telephony_handoff_url', 'https://codex-ultron.onrender.com', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at
where public.company_settings.value is null
   or public.company_settings.value <> 'https://codex-ultron.onrender.com';

update public.ivr_config
set
  greeting_audio_url = regexp_replace(greeting_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings'),
  voicemail_audio_url = regexp_replace(voicemail_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings'),
  hold_music_audio_url = regexp_replace(hold_music_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings')
where coalesce(greeting_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%'
   or coalesce(voicemail_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%'
   or coalesce(hold_music_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%';

update public.ivr_menu_options
set
  dept_after_hours_audio_url = regexp_replace(dept_after_hours_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings'),
  dept_vm_audio_url = regexp_replace(dept_vm_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings')
where coalesce(dept_after_hours_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%'
   or coalesce(dept_vm_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%';
