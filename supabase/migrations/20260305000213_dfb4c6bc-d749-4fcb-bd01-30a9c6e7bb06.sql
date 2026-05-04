
-- Add "Tech completion form submitted" to install post-job template
INSERT INTO public.template_tasks (template_id, title, is_required, due_offset_days, sort_order, description)
SELECT t.id, 'Tech completion form submitted', true, 0, 0, 'Auto-completed when tech submits the job completion form'
FROM public.task_templates t
WHERE t.job_type = 'install' AND t.phase = 'post_job' AND t.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.template_tasks tt WHERE tt.template_id = t.id AND tt.title = 'Tech completion form submitted'
);
