CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  notes text,
  priority text NOT NULL DEFAULT 'normal',
  due_date date,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  job_id uuid REFERENCES public.jobs(id),
  customer_id uuid REFERENCES public.customers(id),
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage todos"
  ON public.todos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.todos;