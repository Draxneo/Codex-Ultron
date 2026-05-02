-- Remove the retired To-Do tool registry rows now that NOW/action_items is the
-- single workflow system.
delete from public.agent_tools
where function_name in ('create_todo', 'complete_todo');

delete from public.ai_model_config
where task_key = 'call_todo_extraction';
