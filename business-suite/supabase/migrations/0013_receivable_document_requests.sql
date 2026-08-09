-- Tracks a missing document (PO, delivery note, tax invoice, etc.) that is
-- blocking payment on a specific outstanding item. Like disputes, this
-- money isn't overdue because the client is slow to pay — it's stuck on
-- paperwork, so it's excluded from aging severity / collection score /
-- AI chasing the same way disputes are.
create table if not exists receivable_document_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  receivable_id uuid not null references receivables(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'purchase_order', 'delivery_note', 'tax_invoice',
    'goods_received_note', 'contract', 'other'
  )),
  description text,
  status text not null default 'pending' check (status in ('pending', 'received')),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  received_at timestamptz
);

create index if not exists receivable_document_requests_receivable_idx
  on receivable_document_requests(receivable_id, status);
create index if not exists receivable_document_requests_business_idx
  on receivable_document_requests(business_id, status);

alter table receivable_document_requests enable row level security;

create policy "receivable_document_requests_business_access"
  on receivable_document_requests for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
