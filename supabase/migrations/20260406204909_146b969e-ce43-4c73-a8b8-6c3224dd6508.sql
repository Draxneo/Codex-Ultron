UPDATE call_log SET status = 'completed'
WHERE status = 'suspected-bot'
AND phone_number IN (
  SELECT phone FROM employees WHERE is_active = true AND phone IS NOT NULL
);