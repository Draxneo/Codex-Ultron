ALTER TABLE public.ivr_menu_options 
ADD COLUMN IF NOT EXISTS dept_vm_greeting text,
ADD COLUMN IF NOT EXISTS dept_vm_audio_url text;