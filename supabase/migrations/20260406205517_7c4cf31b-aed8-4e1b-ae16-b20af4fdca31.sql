UPDATE call_log SET status = 'completed'
WHERE status = 'suspected-bot'
AND RIGHT(regexp_replace(phone_number, '\D', '', 'g'), 10) IN (
  SELECT RIGHT(regexp_replace(phone, '\D', '', 'g'), 10)
  FROM employees
  WHERE is_active = true AND phone IS NOT NULL
)