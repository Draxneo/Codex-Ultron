
-- live_transcripts table for real-time call transcription
CREATE TABLE public.live_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  twilio_sid TEXT NOT NULL,
  speaker TEXT NOT NULL DEFAULT 'inbound',
  text TEXT NOT NULL DEFAULT '',
  is_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by call SID
CREATE INDEX idx_live_transcripts_twilio_sid ON public.live_transcripts (twilio_sid);

-- Enable RLS
ALTER TABLE public.live_transcripts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated can read live_transcripts"
  ON public.live_transcripts FOR SELECT
  TO authenticated
  USING (true);

-- Service role inserts (edge function uses service key, no policy needed for service_role)

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_transcripts;

-- Auto-cleanup: delete transcripts older than 1 hour
CREATE OR REPLACE FUNCTION public.cleanup_old_live_transcripts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.live_transcripts WHERE created_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_live_transcripts
  AFTER INSERT ON public.live_transcripts
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_old_live_transcripts();
