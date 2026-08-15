-- PDF OS Document Vault. Storage layer follows the same convention as
-- compliance-documents / esign-documents: private bucket, path is
-- {owner_id}/{filename}, ownership enforced via storage.foldername(name).
-- Quota (doc count for Free, retention window) is enforced separately at
-- the pdf_os_vault_files table level, not in the storage policy, since
-- that's where plan/usage context actually lives.

insert into storage.buckets (id, name, public, file_size_limit)
values ('pdf-os-vault', 'pdf-os-vault', false, 52428800) -- 50MB per file
on conflict (id) do nothing;

create policy "pdf_os_vault_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'pdf-os-vault' and (storage.foldername(name))[1]::uuid = auth.uid());

create policy "pdf_os_vault_owner_read"
  on storage.objects for select
  using (bucket_id = 'pdf-os-vault' and (storage.foldername(name))[1]::uuid = auth.uid());

create policy "pdf_os_vault_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'pdf-os-vault' and (storage.foldername(name))[1]::uuid = auth.uid());

alter table pdf_os_plan_limits add column if not exists vault_document_limit int not null default 5;
alter table pdf_os_plan_limits add column if not exists vault_retention_days int;

update pdf_os_plan_limits set vault_document_limit = 5, vault_retention_days = 30 where plan = 'free';
update pdf_os_plan_limits set vault_document_limit = 999999, vault_retention_days = null where plan = 'pro';
update pdf_os_plan_limits set vault_document_limit = 999999, vault_retention_days = null where plan = 'business';

create table if not exists pdf_os_vault_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null,
  mime_type text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table pdf_os_vault_files enable row level security;

create policy "pdf_os_vault_files_owner_select"
  on pdf_os_vault_files for select
  using (auth.uid() = user_id);

create policy "pdf_os_vault_files_owner_delete"
  on pdf_os_vault_files for delete
  using (auth.uid() = user_id);

create or replace function pdf_os_vault_within_limit(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  select coalesce(
    (select plan from pdf_os_subscriptions
       where user_id = p_user_id and status = 'active'
         and (expires_at is null or expires_at > now())),
    'free'
  ) into v_plan;

  select vault_document_limit into v_limit from pdf_os_plan_limits where plan = v_plan;
  select count(*) into v_count from pdf_os_vault_files where user_id = p_user_id;

  return v_count < v_limit;
end;
$$;

revoke execute on function pdf_os_vault_within_limit(uuid) from public, anon;
grant execute on function pdf_os_vault_within_limit(uuid) to authenticated, service_role;

create policy "pdf_os_vault_files_owner_insert"
  on pdf_os_vault_files for insert
  with check (auth.uid() = user_id and pdf_os_vault_within_limit(auth.uid()));
