-- Credit & Collections Manager (Business Suite Growth tier)
-- Run this against the KoboDocs Supabase project (vwmzulzluaxedkozxjfy).
-- Mirrors the existing RLS pattern used on `documents` / `clients`:
-- access is scoped to the business's owner or its business_members.
-- If your live policies on those tables differ, adjust the policies
-- below to match before applying.

-- ---------- 1. Tier gating on businesses ----------
alter table businesses
  add column if not exists suite_tier text not null default 'starter'
    check (suite_tier in ('starter', 'growth'));

comment on column businesses.suite_tier is
  'starter = base Business Suite (₦15,000/mo). growth = adds Credit & Collections Manager (₦28,000/mo).';

-- ---------- 2. Promise-to-pay tracking ----------
create table if not exists promise_to_pay (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  promised_date date not null,
  promised_amount numeric(14,2) not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'kept', 'broken')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists promise_to_pay_business_idx on promise_to_pay(business_id);
create index if not exists promise_to_pay_client_idx on promise_to_pay(client_id);

-- ---------- 3. Collection notes (timestamped, per client — distinct from the single clients.notes field) ----------
create table if not exists collection_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  note text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists collection_notes_business_idx on collection_notes(business_id);
create index if not exists collection_notes_client_idx on collection_notes(client_id);

-- ---------- 4. Audit log (credit limit changes, promises, notes, reminders) ----------
create table if not exists credit_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  action text not null, -- e.g. 'credit_limit_changed', 'promise_logged', 'promise_resolved', 'note_added', 'reminder_sent', 'statement_generated'
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists credit_audit_log_business_idx on credit_audit_log(business_id);
create index if not exists credit_audit_log_client_idx on credit_audit_log(client_id);

-- ---------- RLS ----------
-- Uses the project's existing is_business_owner()/is_business_member()
-- helper functions (see businesses_owner_all / businesses_member_select
-- policies) rather than re-deriving membership inline. Tier gating for
-- Growth-only writes happens in the app (guard.js / isGrowth checks),
-- matching how Growth is gated everywhere else in this codebase.
alter table promise_to_pay enable row level security;
alter table collection_notes enable row level security;
alter table credit_audit_log enable row level security;

create policy "promise_to_pay_business_access"
  on promise_to_pay for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));

create policy "collection_notes_business_access"
  on collection_notes for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));

create policy "credit_audit_log_business_access"
  on credit_audit_log for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
