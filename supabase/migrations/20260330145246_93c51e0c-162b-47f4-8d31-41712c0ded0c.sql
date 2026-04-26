-- Drop the trigger that deletes live_transcripts older than 1 hour on every INSERT
DROP TRIGGER IF EXISTS trg_cleanup_old_live_transcripts ON public.live_transcripts;

-- Drop the trigger that deletes copilot_messages older than 60 days on every INSERT
DROP TRIGGER IF EXISTS trg_cleanup_old_copilot_messages ON public.copilot_messages;

-- Drop the cleanup functions (no longer needed)
DROP FUNCTION IF EXISTS public.cleanup_old_live_transcripts() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_copilot_messages() CASCADE;