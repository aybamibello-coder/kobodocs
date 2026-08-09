-- Assigns a client's collections work to a specific team member so a
-- business can split its debtor book across staff and see who's carrying
-- what. One active assignment per client per business (re-assigning
-- overwrites the previous one via upsert on the unique constraint).
create table if not exists receivable_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  assigned_to uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, client_id)
);

create index if not exists receivable_assignments_assignee_idx
  on receivable_assignments(business_id, assigned_to);

alter table receivable_assignments enable row level security;

create policy "receivable_assignments_business_access"
  on receivable_assignments for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
