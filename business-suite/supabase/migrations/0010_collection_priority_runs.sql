-- Stores each AI-assisted "Today's priorities" run for Receivable Manager.
-- One run per business per generation; the app shows the latest run and
-- only re-calls the AI when the user explicitly refreshes or a day has
-- passed, to control API spend on Gemini/Groq.
create table if not exists collection_priority_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  generated_by uuid not null references auth.users(id),
  provider text,
  priorities jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists collection_priority_runs_business_idx
  on collection_priority_runs(business_id, created_at desc);

alter table collection_priority_runs enable row level security;

create policy "collection_priority_runs_business_access"
  on collection_priority_runs for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
