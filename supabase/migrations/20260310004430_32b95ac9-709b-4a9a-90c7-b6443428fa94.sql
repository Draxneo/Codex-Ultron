INSERT INTO agent_tools (function_name, name, description, is_enabled)
VALUES 
  ('search_sms_history', 'Search SMS History', 'Search SMS messages by phone number, contact name, or content keyword', true),
  ('search_call_history', 'Search Call History', 'Search call log by phone number, contact name, or status', true)
ON CONFLICT DO NOTHING;