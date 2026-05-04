-- Normalize old provider label in the cost ledger so the operations screens
-- show one JARVIS/OpenAI cost stream.
update public.api_usage_log
set service = 'openai_ai'
where service = 'lovable_ai';
