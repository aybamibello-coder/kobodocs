-- Tracks each bank-statement transaction the user has already reconciled
-- (matched to a receivable, or explicitly ignored) so re-uploading the
-- same statement doesn't double-log payments.
create table if not exists reconciled_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  tx_date date not null,
  description text not null default '',
  amount numeric(14,2) not null,
  status text not null check (status in ('matched', 'ignored')),
  matched_receivable_id uuid references receivables(id) on delete set null,
  matched_client_id uuid references clients(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists reconciled_transactions_dedupe_idx
  on reconciled_transactions(business_id, tx_date, amount, description);

alter table reconciled_transactions enable row level security;

create policy "reconciled_transactions_business_access"
  on reconciled_transactions for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
