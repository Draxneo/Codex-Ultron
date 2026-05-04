
DO $$
DECLARE
  ghost_ids uuid[];
BEGIN
  SELECT array_agg(j.id) INTO ghost_ids
  FROM public.jobs j
  WHERE j.job_type = 'estimate'
    AND j.hcp_id IS NOT NULL
    AND j.hcp_id IN (SELECT e.hcp_id FROM public.estimates e WHERE e.hcp_id IS NOT NULL);

  IF ghost_ids IS NULL OR array_length(ghost_ids, 1) IS NULL THEN
    RAISE NOTICE 'No ghost estimate rows found';
    RETURN;
  END IF;

  RAISE NOTICE 'Found % ghost rows', array_length(ghost_ids, 1);

  -- Nullify nullable FK refs
  UPDATE public.sms_log SET related_job_id = NULL WHERE related_job_id = ANY(ghost_ids);
  UPDATE public.call_log SET related_job_id = NULL WHERE related_job_id = ANY(ghost_ids);
  UPDATE public.chat_channels SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.activity_log SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.action_items SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.emails SET linked_job_id = NULL WHERE linked_job_id = ANY(ghost_ids);
  UPDATE public.ce_order_items SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.customer_certificates SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.customer_discovery_answers SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.agreement_visits SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.estimate_reviews SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.estimates SET source_job_id = NULL WHERE source_job_id = ANY(ghost_ids);
  UPDATE public.follow_up_inquiries SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.leads SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.outbound_drafts SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.parts_orders SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.paysheet_entries SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.permit_applications SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.plan_perk_usage SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.preinstall_surveys SET job_id = NULL WHERE job_id = ANY(ghost_ids);
  UPDATE public.todos SET job_id = NULL WHERE job_id = ANY(ghost_ids);

  -- Delete child rows
  DELETE FROM public.tech_location_events WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.workflow_alerts WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.job_attachments WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.job_equipment WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.job_line_items WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.job_reminders WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.job_repair_items WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.customer_invoice_items WHERE invoice_id IN (SELECT id FROM public.customer_invoices WHERE job_id = ANY(ghost_ids));
  DELETE FROM public.customer_invoices WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.job_invoices WHERE job_id = ANY(ghost_ids);
  DELETE FROM public.tech_form_responses WHERE tech_form_id IN (SELECT id FROM public.tech_forms WHERE job_id = ANY(ghost_ids));
  DELETE FROM public.tech_form_photos WHERE tech_form_id IN (SELECT id FROM public.tech_forms WHERE job_id = ANY(ghost_ids));
  DELETE FROM public.tech_forms WHERE job_id = ANY(ghost_ids);

  -- Delete ghost jobs
  DELETE FROM public.jobs WHERE id = ANY(ghost_ids);

  RAISE NOTICE 'Cleaned up % ghost rows', array_length(ghost_ids, 1);
END;
$$;
