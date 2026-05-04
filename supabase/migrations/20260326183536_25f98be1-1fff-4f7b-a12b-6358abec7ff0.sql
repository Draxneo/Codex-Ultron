-- Fix old calls stuck on non-terminal statuses
-- Calls older than 1 hour that are still ringing/initiated/in-progress are dead
UPDATE public.call_log
SET status = CASE 
  WHEN status = 'initiated' THEN 'canceled'
  WHEN status = 'ringing' THEN 'no-answer'
  ELSE 'no-answer'
END,
ended_at = COALESCE(ended_at, now())
WHERE status IN ('ringing', 'initiated', 'in-progress')
  AND created_at < now() - interval '1 hour';