CREATE UNIQUE INDEX IF NOT EXISTS action_items_missed_call_call_id_unique_idx
  ON public.action_items ((metadata->>'call_id'))
  WHERE category = 'missed_call' AND metadata ? 'call_id';
