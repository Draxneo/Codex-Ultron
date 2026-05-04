-- Remove routing rules for departments no longer in the IVR menu.
-- Current IVR: 1=Service, 2=Sales. Keep 'general' for non-IVR direct dials.
DELETE FROM public.call_routing_rules
WHERE department NOT IN ('service', 'sales', 'general');