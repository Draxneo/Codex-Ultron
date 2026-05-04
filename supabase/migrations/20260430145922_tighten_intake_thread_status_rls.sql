DROP POLICY IF EXISTS "Authenticated users can manage intake thread status" ON public.intake_thread_status;
CREATE POLICY "Authenticated users can manage intake thread status"
  ON public.intake_thread_status FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'office'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'office'::app_role));
