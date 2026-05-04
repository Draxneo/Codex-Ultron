-- The live IVR config was pointing at /MAINIVR.mp3, which is not a deployed
-- static asset. Restore the checked-in main IVR recording so Twilio receives
-- a real audio file instead of the SPA fallback page.
update public.ivr_config
set
  greeting_audio_url = 'https://codex-ultron.onrender.com/ivr-greetings/main/ElevenLabs_2026-04-22T13_45_53_Clint_Carnes_ivc_sp108_s64_sb88_se49_b_m2.mp3',
  updated_at = now()
where greeting_audio_url is null
   or greeting_audio_url like '%/ivr-greetings/main/MAINIVR.mp3';
