-- Step 1: Normalize the 9 existing employees to canonical roles
-- (Trigger sync_employee_tab_access_trigger will auto-update permissions)
UPDATE public.employees SET role = 'office'     WHERE id = 'ffc0d2c1-a6b0-4364-a91f-354b04d5b533'; -- Irie Wright
UPDATE public.employees SET role = 'supervisor' WHERE id = '1d7919e4-ef96-4963-8054-aff921d721d2'; -- Jonathan Carnes
UPDATE public.employees SET role = 'tech'       WHERE id = '6d427ada-6c15-4d87-bfe7-c935a3e79a16'; -- Cedric Billingsley
UPDATE public.employees SET role = 'installer'  WHERE id = 'e50173ec-6b61-437d-954b-fac88be8a5cc'; -- Tim Konecny
UPDATE public.employees SET role = 'installer'  WHERE id = 'd3553abe-e1b8-4151-93b8-1c20c5e7dcc6'; -- App Hernandez
UPDATE public.employees SET role = 'installer'  WHERE id = '7d430254-d51e-4278-b06e-0d610303ba15'; -- Hector Rodriguez
UPDATE public.employees SET role = 'installer'  WHERE id = 'ae3c68d8-8edd-43a2-b6b8-b78a62cac89d'; -- Juan Avalos

-- Step 2: Add CHECK constraint enforcing canonical roles for future rows
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_role_canonical_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_canonical_check
  CHECK (role IN ('admin', 'office', 'supervisor', 'tech', 'installer'));