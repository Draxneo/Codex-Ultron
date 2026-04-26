-- Re-classify jobs that have brand + tonnage in description as "install"
-- These were previously mis-tagged as "service" due to detection order issues

UPDATE jobs
SET job_type = 'install'
WHERE job_type = 'service'
  AND description IS NOT NULL
  AND (
    -- Brand + Ton pattern = install
    (description ~* '\b(carrier|goodman|payne|day\s*(and|&)\s*night|trane|lennox|rheem|ruud|york|daikin|amana|bryant)\b')
    AND (description ~* '\d+(\.\d+)?\s*[-–]?\s*ton')
  )
  -- Exclude actual service/repair jobs
  AND description !~* '(troubleshoot|diagnostic|no cool|no heat|not cooling|not heating|refrigerant|recharge|contactor|capacitor|fuse|relay|thermostat replacement|valve replacement|compressor replacement|motor replacement|blower motor|fan motor|wiring repair|leak repair|duct clean|duct repair)'
  -- Exclude maintenance
  AND description !~* '(maintenance|tune.?up|clean and check|clean & check|preventive|preventative|seasonal|pm visit)';
