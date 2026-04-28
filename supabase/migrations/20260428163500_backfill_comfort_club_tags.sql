with active_comfort_club as (
  select distinct customer_id
  from public.service_agreements
  where customer_id is not null
    and lower(plan_name) = 'comfort club'
    and status = 'active'
    and end_date >= current_date
)
update public.customers c
set
  tags = (
    select array_agg(distinct tag order by tag)
    from unnest(coalesce(c.tags, '{}'::text[]) || array['Comfort Club']) as tag
  ),
  updated_at = now()
from active_comfort_club a
where c.id = a.customer_id
  and not coalesce(c.tags, '{}'::text[]) @> array['Comfort Club'];
