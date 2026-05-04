DELETE FROM public.outbound_drafts WHERE status = 'pending';
INSERT INTO public.company_settings (key, value) VALUES ('human_in_the_loop', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';