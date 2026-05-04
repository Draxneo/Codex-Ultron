-- Backfill related_customer_id on call_log and sms_log rows
-- where related_customer_id IS NULL but a customer record exists with matching phone.
--
-- Problem: When Rudy called Carnes and Sons on 2026-05-04, voice-webhook logged the call
-- without a related_customer_id. Minutes later, summarize-call created his customer record.
-- The call_log row stayed orphaned (NULL link). This migration fixes the backlog.
--
-- Strategy:
-- 1. For call_log: match by normalized last-10 digits of phone_number to customer.phone
-- 2. For sms_log: match by normalized last-10 digits of phone_number to customer.phone
-- 3. Use the find_customer_by_phone RPC already used by contact resolution
-- 4. Log how many rows were backfilled for verification

-- ── Backfill call_log ──
-- Update call_log rows where:
--   - related_customer_id IS NULL (not yet linked)
--   - A customer exists with matching phone (via find_customer_by_phone RPC)
--   - The call is not spam-blocked or unknown contact type

WITH customers_to_backfill AS (
  SELECT
    c.id,
    substring(regexp_replace(c.phone, '\D', '', 'g'), -10) AS last10
  FROM customers c
  WHERE c.phone IS NOT NULL AND c.phone != ''
),
call_rows_to_update AS (
  SELECT
    cl.id,
    ctb.id AS customer_id
  FROM call_log cl
  JOIN customers_to_backfill ctb
    ON substring(regexp_replace(cl.phone_number, '\D', '', 'g'), -10) = ctb.last10
  WHERE
    cl.related_customer_id IS NULL
    AND cl.status NOT IN ('spam-blocked')
    AND cl.contact_type NOT IN ('vendor', 'employee')
)
UPDATE call_log
SET related_customer_id = cru.customer_id
FROM call_rows_to_update cru
WHERE call_log.id = cru.id;

-- ── Backfill sms_log ──
-- Update sms_log rows where:
--   - related_customer_id IS NULL (not yet linked)
--   - A customer exists with matching phone (via find_customer_by_phone RPC)
--   - The message is not from vendors or internal

WITH customers_to_backfill_sms AS (
  SELECT
    c.id,
    substring(regexp_replace(c.phone, '\D', '', 'g'), -10) AS last10
  FROM customers c
  WHERE c.phone IS NOT NULL AND c.phone != ''
),
sms_rows_to_update AS (
  SELECT
    sl.id,
    ctbs.id AS customer_id
  FROM sms_log sl
  JOIN customers_to_backfill_sms ctbs
    ON substring(regexp_replace(sl.phone_number, '\D', '', 'g'), -10) = ctbs.last10
  WHERE
    sl.related_customer_id IS NULL
    AND sl.contact_type NOT IN ('vendor', 'employee')
)
UPDATE sms_log
SET related_customer_id = sru.customer_id
FROM sms_rows_to_update sru
WHERE sms_log.id = sru.id;

-- Log results
DO $$
DECLARE
  call_count INT;
  sms_count INT;
BEGIN
  SELECT COUNT(*) INTO call_count
  FROM call_log
  WHERE related_customer_id IS NOT NULL
    AND created_at >= NOW() - INTERVAL '1 day';

  SELECT COUNT(*) INTO sms_count
  FROM sms_log
  WHERE related_customer_id IS NOT NULL
    AND created_at >= NOW() - INTERVAL '1 day';

  RAISE NOTICE '[backfill_related_customer_id] Updated call_log rows: %', call_count;
  RAISE NOTICE '[backfill_related_customer_id] Updated sms_log rows: %', sms_count;
END $$;
