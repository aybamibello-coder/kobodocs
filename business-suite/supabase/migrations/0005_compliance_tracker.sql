-- Compliance Tracker v1: obligations calendar, document vault, reminder log.
-- Applied directly to the live project via the Supabase MCP; this file
-- exists so the schema history is tracked in git as well.

create table public.compliance_obligations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  obligation_type text not null check (obligation_type in (
    'vat','paye','annual_return','company_income_tax','pension','nsitf','itf','nhf',
    'business_permit','nafdac','son','ncc','other'
  )),
  title text not null,
  description text,
  due_date date not null,
  recurrence text not null default 'none' check (recurrence in ('none','monthly','quarterly','annually')),
  status text not null default 'pending' check (status in ('pending','completed','overdue','waived')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index compliance_obligations_business_due_idx on public.compliance_obligations(business_id, due_date);

create trigger trg_compliance_obligations_updated_at
  before update on public.compliance_obligations
  for each row execute function set_updated_at();

create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'cac_certificate','memart','tax_clearance','tin_certificate','nafdac_certificate',
    'son_certificate','business_permit','insurance','contract','other'
  )),
  name text not null,
  file_path text,
  issue_date date,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index compliance_documents_business_expiry_idx on public.compliance_documents(business_id, expiry_date);

create trigger trg_compliance_documents_updated_at
  before update on public.compliance_documents
  for each row execute function set_updated_at();

-- Separate from reminder_log because reminder_log.document_id has a hard FK to documents(id).
create table public.compliance_reminder_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  obligation_id uuid references public.compliance_obligations(id) on delete cascade,
  compliance_document_id uuid references public.compliance_documents(id) on delete cascade,
  channel text not null,
  tone text not null default 'polite',
  sent_at timestamptz not null default now(),
  constraint compliance_reminder_log_target_check check (
    (obligation_id is not null and compliance_document_id is null) or
    (obligation_id is null and compliance_document_id is not null)
  )
);

create index compliance_reminder_log_business_idx on public.compliance_reminder_log(business_id);

alter table public.compliance_obligations enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.compliance_reminder_log enable row level security;

create policy compliance_obligations_owner_all on public.compliance_obligations
  for all using (is_business_owner(business_id)) with check (is_business_owner(business_id));

create policy compliance_obligations_member_select on public.compliance_obligations
  for select using (is_business_member(business_id));

create policy compliance_documents_owner_all on public.compliance_documents
  for all using (is_business_owner(business_id)) with check (is_business_owner(business_id));

create policy compliance_documents_member_select on public.compliance_documents
  for select using (is_business_member(business_id));

create policy compliance_reminder_log_owner_select on public.compliance_reminder_log
  for select using (is_business_owner(business_id));

create policy compliance_reminder_log_member_select on public.compliance_reminder_log
  for select using (is_business_member(business_id));

-- Private bucket, same pattern as payroll-payslips / esign-documents: no direct client RLS,
-- access mediated only via edge functions using the service role key.
insert into storage.buckets (id, name, public)
values ('compliance-documents', 'compliance-documents', false)
on conflict (id) do nothing;

-- Compliance documents are user-uploaded (unlike payroll/esign, which are server-generated),
-- so we scope direct client access by business ownership via folder convention: <business_id>/<filename>
create policy compliance_documents_owner_read on storage.objects
  for select using (
    bucket_id = 'compliance-documents'
    and is_business_owner((storage.foldername(name))[1]::uuid)
  );

create policy compliance_documents_owner_write on storage.objects
  for insert with check (
    bucket_id = 'compliance-documents'
    and is_business_owner((storage.foldername(name))[1]::uuid)
  );

create policy compliance_documents_owner_update on storage.objects
  for update using (
    bucket_id = 'compliance-documents'
    and is_business_owner((storage.foldername(name))[1]::uuid)
  );

create policy compliance_documents_owner_delete on storage.objects
  for delete using (
    bucket_id = 'compliance-documents'
    and is_business_owner((storage.foldername(name))[1]::uuid)
  );

create policy compliance_documents_member_read on storage.objects
  for select using (
    bucket_id = 'compliance-documents'
    and is_business_member((storage.foldername(name))[1]::uuid)
  );
