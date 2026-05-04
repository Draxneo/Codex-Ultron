
-- Drop the check_all_tasks_done trigger function (references job_tasks)
DROP FUNCTION IF EXISTS public.check_all_tasks_done() CASCADE;

-- Drop legacy tables in dependency order
DROP TABLE IF EXISTS public.task_photos CASCADE;
DROP TABLE IF EXISTS public.job_tasks CASCADE;
DROP TABLE IF EXISTS public.template_tasks CASCADE;
DROP TABLE IF EXISTS public.task_templates CASCADE;
