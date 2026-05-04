# JARVIS Action Gateway

JARVIS may recommend actions freely, but mutating actions must not write customer-facing or operational records directly from an ordinary chat/tool call.

## Contract

- Mutating JARVIS tools create a `pending` `action_items` row with `category = 'jarvis_action_approval'`.
- The approval row stores `metadata.tool_name`, `metadata.tool_args`, `metadata.approval_token`, and `metadata.approval_gateway = 'jarvis-action-gateway'`.
- The only replay path is `ai-task-agent` with `mode = 'approved_action'`, `approved_action_item_id`, and `approved_action_token`.
- `approved_action` rejects rows that are not pending JARVIS approval cards or whose tool name is not in the backend mutating-tool allowlist.
- Reminder/JARVIS action cards use `status = 'pending'`; legacy or accidental `open` values are normalized by migration trigger.

## Current Implementation

- Backend gateway: `supabase/functions/ai-task-agent/index.ts`
- Model router helper: `supabase/functions/_shared/getTaskModel.ts`
- Status normalization migration: `supabase/migrations/20260427003000_priority4_jarvis_model_status_gateway.sql`

Do not add a new mutating JARVIS tool without adding it to the gateway allowlist and confirming the approval card carries enough context for dispatch review.
