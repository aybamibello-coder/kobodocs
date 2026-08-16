-- Single aggregation entrypoint for the owner dashboard.
create or replace function get_admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not is_kobodocs_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'signups', jsonb_build_object(
      'today', (select count(*) from auth.users where created_at >= date_trunc('day', now())),
      'last_7_days', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'last_30_days', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'all_time', (select count(*) from auth.users)
    ),
    'revenue_naira', jsonb_build_object(
      'today', (select coalesce(sum(amount_naira),0) from payments_log where created_at >= date_trunc('day', now())),
      'last_7_days', (select coalesce(sum(amount_naira),0) from payments_log where created_at >= now() - interval '7 days'),
      'last_30_days', (select coalesce(sum(amount_naira),0) from payments_log where created_at >= now() - interval '30 days'),
      'all_time', (select coalesce(sum(amount_naira),0) from payments_log)
    ),
    'revenue_by_product_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('product', product, 'amount', amount, 'count', cnt) order by amount desc), '[]'::jsonb)
      from (
        select product, sum(amount_naira) as amount, count(*) as cnt
        from payments_log where created_at >= now() - interval '30 days'
        group by product
      ) t
    ),
    'payments_by_day_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'amount', amount) order by day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, sum(amount_naira) as amount
        from payments_log where created_at >= now() - interval '30 days'
        group by 1
      ) t
    ),
    'active_subscriptions_by_product', jsonb_build_array(
      jsonb_build_object('product', 'pdf_toolkit', 'active_count', (select count(*) from pdf_toolkit_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'pdf_os', 'active_count', (select count(*) from pdf_os_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'payroll', 'active_count', (select count(*) from payroll_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'esign', 'active_count', (select count(*) from esign_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'receivable_manager', 'active_count', (select count(*) from receivable_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'wht', 'active_count', (select count(*) from wht_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'freelance_tax', 'active_count', (select count(*) from freelance_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'transcription', 'active_count', (select count(*) from transcription_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'business_suite', 'active_count', (select count(*) from businesses where suite_status='active' and (suite_expires_at is null or suite_expires_at > now())))
    ),
    'one_time_purchases_30d', jsonb_build_object(
      'japa_pass', (select count(*) from relocation_passes where purchased_at >= now() - interval '30 days'),
      'tool_access_passes', (select count(*) from tool_access_passes where purchased_at >= now() - interval '30 days')
    ),
    'usage_highlights_30d', jsonb_build_object(
      'pdf_os_documents_in_vault', (select count(*) from pdf_os_vault_files),
      'transcription_jobs', (select count(*) from transcription_jobs where created_at >= now() - interval '30 days'),
      'ajo_circles_total', (select count(*) from ajo_circles),
      'ajo_contributions', (select count(*) from ajo_contributions where created_at >= now() - interval '30 days'),
      'compliance_assistant_queries', (select count(*) from compliance_assistant_log where created_at >= now() - interval '30 days'),
      'contract_scans', (select count(*) from contract_scans where created_at >= now() - interval '30 days'),
      'documents_created', (select count(*) from documents where created_at >= now() - interval '30 days'),
      'business_suite_expenses_logged', (select count(*) from expenses where created_at >= now() - interval '30 days')
    ),
    'business_suite_snapshot', jsonb_build_object(
      'total_businesses', (select count(*) from businesses),
      'total_clients', (select count(*) from clients),
      'total_receivables', (select count(*) from receivables),
      'total_events', (select count(*) from events)
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function get_admin_dashboard_stats() from public, anon;
grant execute on function get_admin_dashboard_stats() to authenticated;
