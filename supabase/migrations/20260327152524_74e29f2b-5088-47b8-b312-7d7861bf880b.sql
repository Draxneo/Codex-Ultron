UPDATE email_templates SET
  subject_template = 'Quick reminder — your {{job_type}} is {{appointment_date}} 🗓️',
  body_html = '<p style="font-size: 15px; margin-bottom: 16px;">Hey {{customer_name}}! 👋</p>
<p style="font-size: 15px; margin-bottom: 16px;">Just wanted to make sure you saw this — we''ve got your <strong>{{job_type}}</strong> appointment locked in for <strong>{{appointment_date}}</strong> {{time_window}}.</p>
<p style="font-size: 15px; margin-bottom: 16px;">Here''s what to expect: our tech will give you a heads-up call about 30 minutes before they arrive, so you don''t have to sit around watching the window all day. If you have pets, we just ask that they''re secured so everyone stays safe and comfortable.</p>
<p style="font-size: 15px; margin-bottom: 16px;">Need to move things around? No stress at all — just reply to this email or call us at <strong>(210) 355-1919</strong> and we''ll get you rescheduled.</p>
<p style="font-size: 15px; margin-bottom: 0;">See you soon!<br/><strong>Matt &amp; the {{company_name}} crew</strong></p>'
WHERE slug = 'appointment-reminder';

UPDATE email_templates SET
  subject_template = 'Your equipment details are inside 📋',
  body_html = '<p style="font-size: 15px; margin-bottom: 16px;">Hey {{customer_name}},</p>
<p style="font-size: 15px; margin-bottom: 16px;">I attached the manufacturer brochures we talked about — take your time looking them over. There''s no rush, and I want you to feel 100% confident in whatever direction you go.</p>
<p style="font-size: 15px; margin-bottom: 16px;">Each brochure breaks down the specs, warranty coverage, and what makes that particular system a good fit for your home. If any of it feels like alphabet soup, don''t worry — that''s what I''m here for.</p>
<p style="font-size: 15px; margin-bottom: 16px;">Just hit reply anytime and I''ll walk you through it. No pressure, no sales pitch — just straight answers.</p>
<p style="font-size: 15px; margin-bottom: 0;">Talk soon,<br/><strong>Clint Carnes</strong><br/><span style="font-size: 13px; color: #6b7280;">{{company_name}}</span></p>'
WHERE slug = 'brochure';

UPDATE email_templates SET
  subject_template = 'Good news — your CPS rebate is ready to go 💰',
  body_html = '<p style="font-size: 15px; margin-bottom: 16px;">Hey {{customer_name}},</p>
<p style="font-size: 15px; margin-bottom: 16px;">Your CPS Energy rebate form is attached and we''ve already filled out everything for you — all the serial numbers, model info, and efficiency ratings are taken care of.</p>
<p style="font-size: 15px; margin-bottom: 16px;">You don''t need to do a thing except hold onto it for your records. We submit these directly to CPS on your behalf, so you can just sit back and wait for that rebate check. 🎉</p>
<p style="font-size: 15px; margin-bottom: 16px;">If you have any questions about the rebate amount or timeline, just reply here and I''ll fill you in.</p>
<p style="font-size: 15px; margin-bottom: 0;">Enjoy the savings!<br/><strong>{{company_name}}</strong></p>'
WHERE slug = 'rebate';

UPDATE email_templates SET
  subject_template = 'Invoice #{{invoice_number}} — easy online payment inside',
  body_html = '<p style="font-size: 15px; margin-bottom: 16px;">Hey {{customer_name}},</p>
<p style="font-size: 15px; margin-bottom: 16px;">Your invoice is ready! I''ve attached all the details so you can see exactly what was done and what everything costs — no surprises, ever.</p>
<p style="font-size: 15px; margin-bottom: 16px;">You can pay online whenever it''s convenient for you — the link below will take you right to a secure payment page. We accept all major credit cards.</p>
<p style="font-size: 15px; margin-bottom: 16px;">If anything looks off or you have questions about a line item, just reply to this email and we''ll sort it out right away.</p>
<p style="font-size: 15px; margin-bottom: 0;">Thanks for choosing us — we really appreciate your business.<br/><strong>{{company_name}}</strong></p>'
WHERE slug = 'invoice';

UPDATE email_templates SET
  subject_template = '{{customer_name}}, how''d everything go? 🏠',
  body_html = '<p style="font-size: 15px; margin-bottom: 16px;">Hey {{customer_name}},</p>
<p style="font-size: 15px; margin-bottom: 16px;">I hope everything''s been running great since our visit! I just wanted to check in and see how you''re feeling about everything.</p>
<p style="font-size: 15px; margin-bottom: 16px;">If you have a minute, it would mean the world to our family if you could leave us a quick review. We''re a small, family-owned business and honest reviews from real customers are how our neighbors find us.</p>
<p style="font-size: 15px; margin-bottom: 16px;">And hey — if anything''s not right or you have concerns, please tell <em>me</em> first. I''d much rather fix it than have you be unhappy. Just reply to this email.</p>
<p style="font-size: 15px; margin-bottom: 0;">Thanks again for letting us into your home,<br/><strong>Clint Carnes</strong><br/><span style="font-size: 13px; color: #6b7280;">Owner, {{company_name}}</span></p>'
WHERE slug = 'review-request';

UPDATE email_templates SET
  subject_template = 'Your custom quote from {{company_name}}',
  body_html = '<p style="font-size: 15px; margin-bottom: 16px;">Hey {{customer_name}},</p>
<p style="font-size: 15px; margin-bottom: 16px;">Thanks for having me out to your place — I really enjoyed meeting you and getting a look at your system. I put together a few options based on what we talked about, and I think you''re going to like what you see.</p>
<p style="font-size: 15px; margin-bottom: 16px;">Everything is laid out in your personalized quote page — you can compare the options side by side, check out the financing, and see exactly what''s included with each package. No hidden fees, no fine print.</p>
<p style="font-size: 15px; margin-bottom: 16px;">Take your time looking it over. When you''re ready (or if you want to talk through anything), just reply here or call me directly. I''m always happy to answer questions.</p>
<p style="font-size: 15px; margin-bottom: 0;">Looking forward to taking care of you,<br/><strong>Clint Carnes</strong><br/><span style="font-size: 13px; color: #6b7280;">Owner, {{company_name}}</span></p>'
WHERE slug = 'quote';