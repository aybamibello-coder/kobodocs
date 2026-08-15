-- expires_at is set server-side from the plan's retention window, not
-- trusted from whatever the client sends on insert.
create or replace function pdf_os_vault_set_expiry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_retention_days int;
begin
  select coalesce(
    (select plan from pdf_os_subscriptions
       where user_id = new.user_id and status = 'active'
         and (expires_at is null or expires_at > now())),
    'free'
  ) into v_plan;

  select vault_retention_days into v_retention_days from pdf_os_plan_limits where plan = v_plan;

  new.expires_at := case when v_retention_days is null then null
                          else now() + (v_retention_days || ' days')::interval end;
  return new;
end;
$$;

drop trigger if exists pdf_os_vault_set_expiry_trigger on pdf_os_vault_files;
create trigger pdf_os_vault_set_expiry_trigger
  before insert on pdf_os_vault_files
  for each row execute function pdf_os_vault_set_expiry();

-- Scheduled cleanup: removes expired rows AND their storage objects. Daily.
create or replace function pdf_os_vault_cleanup_expired()
returns void
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
begin
  delete from storage.objects
  where bucket_id = 'pdf-os-vault'
    and name in (select storage_path from pdf_os_vault_files where expires_at is not null and expires_at <= now());

  delete from pdf_os_vault_files
  where expires_at is not null and expires_at <= now();
end;
$$;

revoke execute on function pdf_os_vault_cleanup_expired() from public, anon, authenticated;

select cron.schedule(
  'pdf-os-vault-cleanup',
  '17 3 * * *',
  $$select pdf_os_vault_cleanup_expired()$$
);
