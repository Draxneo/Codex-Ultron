ALTER TABLE public.ivr_menu_options
  ADD COLUMN IF NOT EXISTS dept_no_vm_missed_call_sms text,
  ADD COLUMN IF NOT EXISTS dept_no_vm_missed_call_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dept_post_call_sms text,
  ADD COLUMN IF NOT EXISTS dept_post_call_sms_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ivr_menu_options.dept_no_vm_missed_call_sms IS
  'SMS sent when caller chose this dept, hung up without leaving VM. Single source — replaces company_settings.missed_call_sms_*.';
COMMENT ON COLUMN public.ivr_menu_options.dept_post_call_sms IS
  'Thank-you SMS after a completed call to this dept. Single source — replaces company_settings.post_call_sms_*.';