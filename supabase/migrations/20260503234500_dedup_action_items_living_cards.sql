-- 20260503234500_dedup_action_items_living_cards.sql
--
-- Backfill: collapse duplicate non-terminal action_items into a single living card per
-- real-world unit of work. The forward fix lives in
-- supabase/functions/_shared/actionItems.ts (dedup widened beyond `pending`-only and
-- beyond a narrow category whitelist). This migration cleans up cards already created
-- by the old, too-narrow behavior so dispatch sees one card per job, not three.
--
-- Definition of a "duplicate set":
--   PASS 1 -- job-bound:    rows that share the same job_id and are non-terminal.
--   PASS 2 -- phone-bound:  rows with no job_id but the same normalized 10-digit phone
--                           and the same business_unit_id, all non-terminal.
--
-- For each set we pick the OLDEST card as the survivor, merge every sibling's
-- context_updates into it (newest-first, capped at 12 to match the helper), and mark
-- siblings as `resolved` with metadata.merged_into pointing at the survivor's id so
-- the merge is auditable and reversible if needed.

DO $$
DECLARE
  v_group RECORD;
  v_merged_updates JSONB;
BEGIN
  ----------------------------------------------------------------
  -- PASS 1: jobs with multiple non-terminal cards
  ----------------------------------------------------------------
  FOR v_group IN
    SELECT
      job_id,
      (array_agg(id ORDER BY created_at ASC))[1]  AS survivor_id,
      (array_agg(id ORDER BY created_at ASC))[2:] AS sibling_ids,
      array_agg(id ORDER BY created_at ASC)       AS all_ids
    FROM public.action_items
    WHERE job_id IS NOT NULL
      AND status IN ('pending','accepted','in_progress')
    GROUP BY job_id
    HAVING COUNT(*) > 1
  LOOP
    -- Combine context_updates across the cluster, newest first, cap at 12.
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_merged_updates
    FROM (
      SELECT elem
      FROM public.action_items ai
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(ai.metadata->'context_updates', '[]'::jsonb)
      ) AS elem
      WHERE ai.id = ANY(v_group.all_ids)
      ORDER BY (elem->>'at')::timestamptz DESC NULLS LAST
      LIMIT 12
    ) AS top_updates;

    -- Refresh survivor's context_updates and stamp last_context_update_at.
    UPDATE public.action_items
    SET metadata = COALESCE(metadata, '{}'::jsonb)
                 || jsonb_build_object(
                      'context_updates', v_merged_updates,
                      'last_context_update_at', to_jsonb(now()),
                      'living_card', true
                    )
    WHERE id = v_group.survivor_id;

    -- Mark siblings as merged-and-resolved.
    UPDATE public.action_items
    SET status      = 'resolved',
        resolved_at = COALESCE(resolved_at, now()),
        metadata    = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'merged_into', to_jsonb(v_group.survivor_id::text),
                         'merged_reason', 'job_id_dedup_backfill_2026_05_03'
                       )
    WHERE id = ANY(v_group.sibling_ids);
  END LOOP;

  ----------------------------------------------------------------
  -- PASS 2: phone + business duplicates with no job_id on any side
  ----------------------------------------------------------------
  FOR v_group IN
    WITH eligible AS (
      SELECT
        id,
        created_at,
        metadata,
        regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g') AS digits_raw,
        COALESCE(metadata->>'business_unit_id', '')                  AS bu_id
      FROM public.action_items
      WHERE status IN ('pending','accepted','in_progress')
        AND job_id IS NULL
    ),
    normalized AS (
      SELECT
        id,
        created_at,
        metadata,
        right(digits_raw, 10) AS digits,
        bu_id
      FROM eligible
      WHERE length(digits_raw) >= 10
    )
    SELECT
      digits,
      bu_id,
      (array_agg(id ORDER BY created_at ASC))[1]  AS survivor_id,
      (array_agg(id ORDER BY created_at ASC))[2:] AS sibling_ids,
      array_agg(id ORDER BY created_at ASC)       AS all_ids
    FROM normalized
    GROUP BY digits, bu_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_merged_updates
    FROM (
      SELECT elem
      FROM public.action_items ai
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(ai.metadata->'context_updates', '[]'::jsonb)
      ) AS elem
      WHERE ai.id = ANY(v_group.all_ids)
      ORDER BY (elem->>'at')::timestamptz DESC NULLS LAST
      LIMIT 12
    ) AS top_updates;

    UPDATE public.action_items
    SET metadata = COALESCE(metadata, '{}'::jsonb)
                 || jsonb_build_object(
                      'context_updates', v_merged_updates,
                      'last_context_update_at', to_jsonb(now()),
                      'living_card', true
                    )
    WHERE id = v_group.survivor_id;

    UPDATE public.action_items
    SET status      = 'resolved',
        resolved_at = COALESCE(resolved_at, now()),
        metadata    = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'merged_into', to_jsonb(v_group.survivor_id::text),
                         'merged_reason', 'phone_business_dedup_backfill_2026_05_03'
                       )
    WHERE id = ANY(v_group.sibling_ids);
  END LOOP;
END $$;
