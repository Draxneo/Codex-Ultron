
ALTER TABLE public.chat_channels
ADD COLUMN estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX chat_channels_estimate_id_unique ON public.chat_channels (estimate_id) WHERE estimate_id IS NOT NULL;
