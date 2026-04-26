
-- Add native status column to jobs (separate from hcp_status)
ALTER TABLE public.jobs ADD COLUMN status text NOT NULL DEFAULT 'unscheduled';
