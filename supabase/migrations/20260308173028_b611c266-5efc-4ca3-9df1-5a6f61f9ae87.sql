
-- Private email folders (per-user)
CREATE TABLE public.email_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folders"
  ON public.email_folders FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Folder assignments (which emails are in which folders)
CREATE TABLE public.email_folder_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES public.email_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (email_id, folder_id)
);

ALTER TABLE public.email_folder_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folder assignments"
  ON public.email_folder_assignments FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
