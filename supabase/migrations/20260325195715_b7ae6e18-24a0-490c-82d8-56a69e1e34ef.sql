
-- Add agent_id FK to agent_tools
ALTER TABLE public.agent_tools ADD COLUMN agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- Tag existing 7 orchestrator tools
UPDATE public.agent_tools SET agent_id = '7b185815-a58b-4b30-b9ba-a8982280d4ee';

-- Insert specialist tools with agent ownership
-- Communications agent tools
INSERT INTO public.agent_tools (name, function_name, description, is_enabled, agent_id) VALUES
  ('Send SMS to Employee', 'send_sms_to_employee', 'Sends a text message to any employee or customer phone number through Twilio.', true, '6c22e0a0-b9fe-424e-8f1d-eb718a3b131f'),
  ('Send Tech Form Link', 'send_tech_form_link', 'Texts the assigned technician a link to their pre-install checklist or job completion form.', true, '6c22e0a0-b9fe-424e-8f1d-eb718a3b131f'),
  ('Search SMS History', 'search_sms_history', 'Searches past text messages by phone number, contact name, or keywords in the message.', true, '6c22e0a0-b9fe-424e-8f1d-eb718a3b131f'),
  ('Search Call History', 'search_call_history', 'Searches past phone calls by phone number, contact name, or whether they were answered/missed.', true, '6c22e0a0-b9fe-424e-8f1d-eb718a3b131f'),
  ('Read Chat Messages', 'read_chat_messages', 'Reads recent messages from a team chat channel so the AI can catch up on a conversation.', true, '6c22e0a0-b9fe-424e-8f1d-eb718a3b131f'),
  ('Send Chat Message', 'send_chat_message', 'Posts a message into one of the team chat channels on behalf of the AI.', true, '6c22e0a0-b9fe-424e-8f1d-eb718a3b131f'),

-- Email agent tools
  ('Search Emails', 'search_emails', 'Searches all company emails by keyword — checks the subject line, body, sender, and recipient.', true, '0dfd9482-0a2e-4e7a-a30f-566ec03685cd'),
  ('Read Email Thread', 'read_email_thread', 'Opens and reads a full email conversation so the AI can understand the complete context.', true, '0dfd9482-0a2e-4e7a-a30f-566ec03685cd'),
  ('Extract Email Attachment', 'extract_email_attachment', 'Pulls text and data out of email attachments like PDFs.', true, '0dfd9482-0a2e-4e7a-a30f-566ec03685cd'),
  ('Send Brochure Email', 'send_brochure_email', 'Emails a manufacturer equipment brochure PDF directly to a customer.', true, '0dfd9482-0a2e-4e7a-a30f-566ec03685cd'),

-- Sales Docs agent tools
  ('Create Quote', 'create_quote', 'Builds a customer quote with Good, Better, and Best equipment options based on home requirements.', true, '01172c92-e3f5-487e-a671-a5182e4099d7'),
  ('Convert Estimate to Job', 'convert_estimate_to_job', 'Takes an approved estimate and turns it into a real active job.', true, '01172c92-e3f5-487e-a671-a5182e4099d7'),
  ('Generate Letterhead Document', 'generate_letterhead_document', 'Creates a professional letterhead PDF document — proposals, letters, or any formatted company document.', true, '01172c92-e3f5-487e-a671-a5182e4099d7'),

-- Scheduling agent tools
  ('Get Travel Times', 'get_travel_times', 'Calculates drive times between each job on a tech''s schedule for a given day.', true, 'd8e93723-375d-400c-a10b-1058170c1324'),
  ('Check Scheduling Fit', 'check_scheduling_fit', 'Checks if a new job address fits into a tech''s existing schedule without too much extra drive time.', true, 'd8e93723-375d-400c-a10b-1058170c1324'),
  ('Suggest Schedule Optimization', 'suggest_schedule_optimization', 'Looks at all jobs on a given day and suggests a better order to reduce total driving time.', true, 'd8e93723-375d-400c-a10b-1058170c1324'),

-- Invoicing agent tools
  ('Create Invoice', 'create_invoice', 'Creates a customer invoice for a completed job, including all line items and tax.', true, 'a113219f-3a8a-4a87-9d96-b02803d49e66'),
  ('Generate Payment Link', 'generate_payment_link', 'Creates a Stripe payment link so customers can pay an invoice or deposit online.', true, 'a113219f-3a8a-4a87-9d96-b02803d49e66');
