create or replace function public.get_public_subcontractor_job(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_photos jsonb;
begin
  select
    l.*,
    j.job_number,
    j.hcp_job_number,
    j.customer_name,
    j.customer_phone,
    j.address,
    j.scheduled_date,
    j.arrival_start,
    j.arrival_end,
    j.description,
    j.job_type,
    j.brand,
    j.tonnage,
    j.system_type,
    j.orientation
  into v_link
  from public.subcontractor_job_links l
  join public.jobs j on j.id = l.job_id
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  update public.subcontractor_job_links
  set last_viewed_at = now()
  where id = v_link.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ja.id,
    'file_name', ja.file_name,
    'file_path', ja.file_path,
    'file_type', ja.file_type,
    'category', ja.category,
    'created_at', ja.created_at
  ) order by ja.created_at desc), '[]'::jsonb)
  into v_photos
  from public.job_attachments ja
  where ja.job_id = v_link.job_id
    and ja.category like 'subcontractor_%';

  return jsonb_build_object(
    'token', v_link.token,
    'job_id', v_link.job_id,
    'job_number', coalesce(v_link.job_number, v_link.hcp_job_number),
    'customer_name', v_link.customer_name,
    'customer_phone', v_link.customer_phone,
    'address', v_link.address,
    'scheduled_date', v_link.scheduled_date,
    'arrival_start', v_link.arrival_start,
    'arrival_end', v_link.arrival_end,
    'job_type', v_link.job_type,
    'brand', v_link.brand,
    'tonnage', v_link.tonnage,
    'system_type', v_link.system_type,
    'orientation', v_link.orientation,
    'scope', coalesce(v_link.scope, v_link.description),
    'equipment_summary', v_link.equipment_summary,
    'subcontractor_name', v_link.subcontractor_name,
    'required_photo_slots', v_link.required_photo_slots,
    'completed_at', v_link.completed_at,
    'expires_at', v_link.expires_at,
    'photos', v_photos
  );
end;
$$;

grant execute on function public.get_public_subcontractor_job(text) to anon, authenticated;

