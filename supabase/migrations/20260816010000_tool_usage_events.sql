create table if not exists tool_usage_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  tool text not null,
  params jsonb not null default '{}'::jsonb,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tool_usage_events_created_at_idx on tool_usage_events(created_at desc);
create index if not exists tool_usage_events_tool_idx on tool_usage_events(tool);
create index if not exists tool_usage_events_event_name_idx on tool_usage_events(event_name);

alter table tool_usage_events enable row level security;

create policy "anyone can log a tool usage event"
  on tool_usage_events for insert
  with check (true);

grant insert on tool_usage_events to anon, authenticated;
grant usage on schema public to anon, authenticated;
