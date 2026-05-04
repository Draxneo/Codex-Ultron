-- Make the database source of truth match the runtime behavior.
-- Edge functions already normalize google/gemini/anthropic/claude model names
-- to OpenAI, but leaving those names in ai_model_config makes the app look like
-- it is still routed through old providers.

UPDATE public.ai_model_config
SET
  model = 'gpt-5-mini',
  updated_at = now()
WHERE
  lower(model) LIKE 'google/%'
  OR lower(model) LIKE 'gemini%'
  OR lower(model) LIKE 'anthropic/%'
  OR lower(model) LIKE 'claude%';
