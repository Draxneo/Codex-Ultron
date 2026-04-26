-- Register the answering service number in company_settings (so the webhook can read it without hardcoding)
INSERT INTO public.company_settings (key, value)
VALUES ('answering_service_phone', '+18449350432')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Cleanup: relabel all sms_log rows on the 844 line as "Answering Service" + clear bogus customer link
UPDATE public.sms_log
SET contact_name = 'Answering Service',
    contact_type = 'service'
WHERE right(regexp_replace(phone_number, '\D', '', 'g'), 10) = '8449350432';

-- Cleanup: delete the bogus auto-created Carolyn Chatham record
-- (uses merge_customers? No — just direct delete since no jobs/etc reference it)
-- First reassign any todos / action_items off this customer
UPDATE public.action_items
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{contact_label}', '"Answering Service"')
WHERE customer_phone = '+18449350432';

-- Delete the bogus customer record (cb810b8b-da32-46c7-9df5-18a0c8bdeca0 = Carolyn Chatham)
DELETE FROM public.customers WHERE id = 'cb810b8b-da32-46c7-9df5-18a0c8bdeca0';