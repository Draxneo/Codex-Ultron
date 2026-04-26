
CREATE TABLE public.follow_up_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  employee_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  asked_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz,
  reply_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_up_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access to follow_up_inquiries"
  ON public.follow_up_inquiries FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
