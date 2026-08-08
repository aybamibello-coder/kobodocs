-- Tracks WHY a specific outstanding item isn't paid yet (missing PO, quality
-- issue, pricing disagreement, etc.) so collections doesn't blindly chase a
-- balance that's legitimately in dispute. One row per dispute; a receivable
-- can have dispute history but only one should be 'open' at a time (enforced
-- in the app, not the db, to keep this simple).
create table if not exists receivable_disputes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  receivable_id uuid not null references receivables(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  reason text not null check (reason in (
    'missing_po', 'quality_issue', 'pricing_disagreement',
    'goods_not_received', 'duplicate_billing', 'already_paid_claim', 'other'
  )),
  description text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note text,
  raised_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists receivable_disputes_receivable_idx
  on receivable_disputes(receivable_id, status);
create index if not exists receivable_disputes_business_idx
  on receivable_disputes(business_id, status);

alter table receivable_disputes enable row level security;

create policy "receivable_disputes_business_access"
  on receivable_disputes for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
