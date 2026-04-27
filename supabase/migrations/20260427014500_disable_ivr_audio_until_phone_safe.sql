-- Temporarily prefer Twilio text-to-speech until custom IVR audio is re-encoded
-- and served with phone-safe headers. This prevents loud static on live calls.
update public.ivr_config
set
  greeting_audio_url = null,
  voicemail_audio_url = null,
  after_hours_audio_url = null,
  hold_music_audio_url = null;

update public.ivr_menu_options
set
  dept_after_hours_audio_url = null,
  dept_vm_audio_url = null;
