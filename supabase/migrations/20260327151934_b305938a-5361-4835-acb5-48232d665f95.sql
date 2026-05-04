INSERT INTO email_templates (slug, name, category, subject_template, body_html, description, is_active)
VALUES
  ('appointment-reminder', 'Appointment Reminder', 'reminders',
   'Your {{job_type}} appointment — {{appointment_date}}',
   '<p style="font-size: 15px;">Hey {{customer_name}},</p>
<p style="font-size: 15px;">Just a quick heads-up — we''ve got you on the schedule for <strong>{{job_type}}</strong> on <strong>{{appointment_date}}</strong>{{time_window}}.</p>
<p style="font-size: 15px;">Our tech will give you a call when they''re headed your way, so no need to sit around waiting. If something comes up and you need to reschedule, just reply to this email or give us a ring.</p>
<p style="font-size: 15px;">We''ll see you soon!</p>
<p style="font-size: 15px;">— The <strong>{{company_name}}</strong> crew</p>',
   'Sent the day before and morning of a scheduled job', true),

  ('brochure', 'Equipment Brochure', 'general',
   'Your equipment info is ready, {{customer_name}}',
   '<p style="font-size: 15px;">Hey {{customer_name}},</p>
<p style="font-size: 15px;">I put together some equipment info for you — the manufacturer brochures are attached so you can look everything over at your own pace.</p>
<p style="font-size: 15px;">If anything jumps out or you have questions, just hit reply and I''ll get right back to you.</p>
<p style="font-size: 15px;">Talk soon,<br/><strong>{{company_name}}</strong></p>',
   'Sent with manufacturer brochure PDFs attached', true),

  ('rebate', 'CPS Rebate Form', 'general',
   'Your rebate form is ready, {{customer_name}}',
   '<p style="font-size: 15px;">Hey {{customer_name}},</p>
<p style="font-size: 15px;">Great news — your CPS rebate form is attached and ready to go. We already filled it out for you so you don''t have to worry about the paperwork.</p>
<p style="font-size: 15px;">If you need anything else, just reply here and I''ll take care of it.</p>
<p style="font-size: 15px;">— <strong>{{company_name}}</strong></p>',
   'Sent with CPS rebate application attached', true),

  ('invoice', 'Invoice Delivery', 'invoicing',
   'Invoice {{invoice_number}} from {{company_name}}',
   '<p style="font-size: 15px;">Hey {{customer_name}},</p>
<p style="font-size: 15px;">Your invoice is ready — you can view the details and pay online whenever it''s convenient.</p>',
   'Sent when an invoice is delivered to a customer', true),

  ('review-request', 'Review Request', 'follow_up',
   'How''d we do, {{customer_name}}?',
   '<p style="font-size: 15px;">Hey {{customer_name}},</p>
<p style="font-size: 15px;">Thanks again for trusting us with your home — it really means a lot to our family. If you have a minute, we''d love to hear how everything went.</p>
<p style="font-size: 15px;">A quick review helps other families in the neighborhood find us, and we genuinely appreciate it.</p>
<p style="font-size: 15px;">Thanks again,<br/><strong>{{company_name}}</strong></p>',
   'Sent after job completion asking for a review', true)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  subject_template = EXCLUDED.subject_template,
  body_html = EXCLUDED.body_html,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;