-- Final cleanup: remove leftover hosted-app/old-storage references from live
-- configuration now that UltraOffice2.0 owns the data.

DO $$
BEGIN
  IF to_regclass('public.email_category_overrides') IS NOT NULL THEN
    DELETE FROM public.email_category_overrides
    WHERE domain = 'lovable.dev';
  END IF;
END $$;

UPDATE public.company_settings
SET value = 'https://codex-ultron.onrender.com',
    updated_at = now()
WHERE key = 'telephony_handoff_url'
  AND value IS DISTINCT FROM 'https://codex-ultron.onrender.com';

UPDATE public.ivr_config
SET
  greeting_audio_url = regexp_replace(greeting_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings'),
  voicemail_audio_url = regexp_replace(voicemail_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings'),
  hold_music_audio_url = regexp_replace(hold_music_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings')
WHERE coalesce(greeting_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%'
   OR coalesce(voicemail_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%'
   OR coalesce(hold_music_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%';

UPDATE public.ivr_menu_options
SET
  dept_after_hours_audio_url = regexp_replace(dept_after_hours_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings'),
  dept_vm_audio_url = regexp_replace(dept_vm_audio_url, '^https://[^/]+\.supabase\.co/storage/v1/object/public/ivr-greetings', 'https://codex-ultron.onrender.com/ivr-greetings')
WHERE coalesce(dept_after_hours_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%'
   OR coalesce(dept_vm_audio_url, '') ilike '%supabase.co/storage/v1/object/public/ivr-greetings%';
