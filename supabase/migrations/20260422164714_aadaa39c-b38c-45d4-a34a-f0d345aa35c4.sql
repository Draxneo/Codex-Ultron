ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS profile_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_profile_id_fkey'
  ) THEN
    ALTER TABLE public.employees
    ADD CONSTRAINT employees_profile_id_fkey
    FOREIGN KEY (profile_id)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_profile_id_unique
ON public.employees (profile_id)
WHERE profile_id IS NOT NULL;