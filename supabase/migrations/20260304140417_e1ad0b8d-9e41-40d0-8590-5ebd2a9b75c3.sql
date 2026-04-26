CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  template_body text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sms_templates" ON public.sms_templates FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.sms_templates (name, category, template_body) VALUES
('Install Job Assignment', 'install', '🏠 NEW INSTALL ASSIGNMENT

📋 Customer: {{customer_name}}
📍 Address: {{address}}
📅 Date: {{scheduled_date}}

🔧 Job #{{job_number}}
➡️ Type: {{job_type}}

📝 Notes: {{description}}

✅ Pre-job tasks assigned — check your task list!'),

('Service Call Assignment', 'service', '🔧 SERVICE CALL

📋 Customer: {{customer_name}}
📍 Address: {{address}}
📅 Date: {{scheduled_date}}

🔧 Job #{{job_number}}
➡️ Issue: {{description}}

📞 Customer phone: {{customer_phone}}'),

('Overdue Task Reminder', 'overdue_reminder', '⚠️ OVERDUE TASK ALERT

📋 Task: {{task_title}}
🏠 Job #{{job_number}} — {{customer_name}}
📅 Was due: {{due_date}}

❗ Please complete ASAP or update status.'),

('Daily Schedule', 'general', '📅 TODAY''S SCHEDULE — {{date}}

{{schedule_items}}

✅ Check your task list for pre/post job items!'),

('Install Specs', 'install', '📋 Specifications
➡️ Orientation: {{orientation}}
➡️ Cooling Condenser: {{condenser_model}}
➡️ Gas Furnace: {{furnace_model}}
➡️ Evaporator Coil: {{coil_model}}

🔧 Models | Serials
➡️ OUTDOOR – {{outdoor_model}} | {{outdoor_serial}}
➡️ FURNACE – {{furnace_model}} | {{furnace_serial}}
➡️ COIL – {{coil_model}} | {{coil_serial}}

⚡ Efficiency
➡️ SEER2: {{seer2}}
➡️ EER2: {{eer2}}
➡️ Cooling Capacity: {{btu}} BTU');