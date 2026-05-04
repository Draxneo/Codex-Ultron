
-- 1. AI category column
ALTER TABLE emails ADD COLUMN category text;

-- 2. Job/customer linking
ALTER TABLE emails ADD COLUMN linked_job_id uuid REFERENCES jobs(id);
ALTER TABLE emails ADD COLUMN linked_customer_id uuid REFERENCES customers(id);
CREATE INDEX idx_emails_linked_job ON emails(linked_job_id);
CREATE INDEX idx_emails_linked_customer ON emails(linked_customer_id);

-- 3. Employee email aliases
CREATE TABLE employee_email_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email_alias text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE employee_email_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email aliases"
ON employee_email_aliases FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read email aliases"
ON employee_email_aliases FOR SELECT
TO authenticated
USING (true);
