
-- Create jobs table (synced from HCP)
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id TEXT UNIQUE,
  hcp_job_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  address TEXT,
  job_type TEXT DEFAULT 'service',
  scheduled_date DATE,
  assigned_to TEXT,
  hcp_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ
);

-- Create task_templates table
CREATE TABLE public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('pre_job', 'post_job')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create template_tasks table
CREATE TABLE public.template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT false,
  due_offset_days INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- Create job_tasks table
CREATE TABLE public.job_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  template_task_id UUID REFERENCES public.template_tasks(id),
  phase TEXT NOT NULL CHECK (phase IN ('pre_job', 'post_job')),
  title TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT false,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped', 'na')),
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT DEFAULT 'tech',
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS on all tables
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- For now, allow all authenticated users full access (this is an internal tool)
-- Jobs policies
CREATE POLICY "Allow all access to jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);

-- Task templates policies
CREATE POLICY "Allow all access to task_templates" ON public.task_templates FOR ALL USING (true) WITH CHECK (true);

-- Template tasks policies
CREATE POLICY "Allow all access to template_tasks" ON public.template_tasks FOR ALL USING (true) WITH CHECK (true);

-- Job tasks policies
CREATE POLICY "Allow all access to job_tasks" ON public.job_tasks FOR ALL USING (true) WITH CHECK (true);

-- Employees policies
CREATE POLICY "Allow all access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_jobs_scheduled_date ON public.jobs(scheduled_date);
CREATE INDEX idx_jobs_job_type ON public.jobs(job_type);
CREATE INDEX idx_job_tasks_job_id ON public.job_tasks(job_id);
CREATE INDEX idx_job_tasks_status ON public.job_tasks(status);
CREATE INDEX idx_job_tasks_due_date ON public.job_tasks(due_date);
CREATE INDEX idx_template_tasks_template_id ON public.template_tasks(template_id);
