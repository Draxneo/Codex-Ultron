
-- Add portal_config JSONB column to permit_authorities
ALTER TABLE public.permit_authorities
ADD COLUMN IF NOT EXISTS portal_config jsonb DEFAULT '{}'::jsonb;

-- Add inspection_scheduling_url column  
ALTER TABLE public.permit_authorities
ADD COLUMN IF NOT EXISTS inspection_scheduling_url text;

-- Create permit_applications table
CREATE TABLE public.permit_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  authority_id uuid REFERENCES public.permit_authorities(id) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmation_number text,
  permit_number text,
  submitted_at timestamptz,
  approved_at timestamptz,
  inspection_scheduled_at timestamptz,
  inspection_status text,
  notes text,
  automation_log jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.permit_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage permit_applications"
ON public.permit_applications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index for fast job lookups
CREATE INDEX idx_permit_applications_job_id ON public.permit_applications(job_id);

-- Enable realtime for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.permit_applications;
