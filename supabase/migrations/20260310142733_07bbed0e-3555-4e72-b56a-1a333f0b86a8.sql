
-- Create copilot_sessions table
CREATE TABLE public.copilot_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT 'General',
  call_sid TEXT,
  phone_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- RLS
ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own copilot_sessions"
  ON public.copilot_sessions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add session_id FK to copilot_messages
ALTER TABLE public.copilot_messages
  ADD COLUMN session_id UUID REFERENCES public.copilot_sessions(id) ON DELETE CASCADE;
