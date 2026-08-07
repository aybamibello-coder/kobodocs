-- AI Compliance Assistant: logs each Q&A for audit/history. The assistant
-- itself is the compliance-assistant edge function, which answers only
-- from a business's own obligations/documents data (see function source
-- for the full grounding rules) and requires ANTHROPIC_API_KEY to be set
-- as an Edge Function secret before it will return real answers.

create table public.compliance_assistant_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  asked_by uuid references auth.users(id) on delete set null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

create index compliance_assistant_log_business_idx on public.compliance_assistant_log(business_id, created_at desc);

alter table public.compliance_assistant_log enable row level security;

create policy compliance_assistant_log_owner_all on public.compliance_assistant_log
  for all using (is_business_owner(business_id)) with check (is_business_owner(business_id));

create policy compliance_assistant_log_member_select on public.compliance_assistant_log
  for select using (is_business_member(business_id));

create policy compliance_assistant_log_member_insert on public.compliance_assistant_log
  for insert with check (is_business_member(business_id));
