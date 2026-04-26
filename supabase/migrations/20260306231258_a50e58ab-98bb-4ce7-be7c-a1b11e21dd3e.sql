-- Re-classify jobs: brand + tonnage in description = install (not service)
UPDATE jobs
SET job_type = 'install'
WHERE job_type = 'service'
  AND description IS NOT NULL
  AND description ~* '(carrier|goodman|payne|day\s*(and|&)\s*night|trane|lennox|rheem|ruud|york|daikin|amana|bryant)'
  AND description ~* '\d+(\.\d+)?\s*[-–]?\s*ton'
  AND description !~* '(troubleshoot|diagnostic|no cool|no heat|not cooling|not heating|refrigerant|recharge|contactor|capacitor|fuse|relay|thermostat replacement|valve replacement|compressor replacement|motor replacement|blower motor|fan motor|wiring repair|leak repair|duct clean|duct repair)'
  AND description !~* '(maintenance|tune.?up|clean and check|clean & check|preventive|preventative|seasonal|pm visit)';
