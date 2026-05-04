-- Move JARVIS off the old chat_channels/chat_messages tool names.
-- The old tables stay intact for history, but active Team HQ tooling now uses team_*.

update public.agent_tools
set
  is_enabled = false,
  description = 'Retired legacy chat tool. Use Team Headquarters tooling instead.'
where function_name in ('read_chat_messages', 'send_chat_message');

with canonical_tools(function_name, name, description) as (
  values
    ('read_team_messages', 'Read Team Messages', 'Read recent messages from Team Headquarters rooms and direct conversations.'),
    ('send_team_message', 'Send Team Message', 'Prepare a Team Headquarters message for approval, then post it to the selected room.')
)
insert into public.agent_tools (function_name, name, description, is_enabled)
select function_name, name, description, true
from canonical_tools c
where not exists (
  select 1 from public.agent_tools existing
  where existing.function_name = c.function_name
);

update public.agent_tools existing
set
  name = c.name,
  description = c.description,
  is_enabled = true
from (
  values
    ('read_team_messages', 'Read Team Messages', 'Read recent messages from Team Headquarters rooms and direct conversations.'),
    ('send_team_message', 'Send Team Message', 'Prepare a Team Headquarters message for approval, then post it to the selected room.')
) as c(function_name, name, description)
where existing.function_name = c.function_name;
