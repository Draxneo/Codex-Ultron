ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS sendgrid_message_id text DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_sendgrid_message_id ON public.emails(sendgrid_message_id) WHERE sendgrid_message_id IS NOT NULL;