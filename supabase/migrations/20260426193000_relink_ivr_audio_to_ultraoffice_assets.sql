update public.ivr_config
set
  greeting_audio_url = 'https://codex-ultron.onrender.com/ivr-greetings/main/ElevenLabs_2026-04-22T13_45_53_Clint_Carnes_ivc_sp108_s64_sb88_se49_b_m2.mp3',
  voicemail_audio_url = 'https://codex-ultron.onrender.com/ivr-greetings/holiday-vm/Holiday_VM.wav',
  hold_music_audio_url = 'https://codex-ultron.onrender.com/ivr-greetings/hold-music/The_Galway_Gallop_2026-04-22T135325.mp3',
  updated_at = now()
where id is not null;

update public.ivr_menu_options
set
  dept_after_hours_audio_url = case digit
    when '1' then 'https://codex-ultron.onrender.com/ivr-greetings/dept-1/New_Main_Afterhours.wav'
    when '2' then 'https://codex-ultron.onrender.com/ivr-greetings/dept-2/Clint_Sales_After_Hours.wav'
    else dept_after_hours_audio_url
  end,
  dept_vm_audio_url = case digit
    when '1' then 'https://codex-ultron.onrender.com/ivr-greetings/dept-1-vm/During_Hours_VM.wav'
    when '2' then 'https://codex-ultron.onrender.com/ivr-greetings/dept-2-vm/During_Hours_VM.wav'
    else dept_vm_audio_url
  end,
  updated_at = now()
where digit in ('1', '2');
