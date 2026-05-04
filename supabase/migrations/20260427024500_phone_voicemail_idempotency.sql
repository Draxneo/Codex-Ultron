CREATE UNIQUE INDEX IF NOT EXISTS voicemails_recording_sid_unique_idx
  ON public.voicemails (recording_sid)
  WHERE recording_sid IS NOT NULL;
