-- Adds KoboDocs Booking active-subscription count to the admin dashboard
-- stats function, alongside Forms and Survey. Applied directly to
-- Supabase in this session; committed here so the repo matches live.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      from (select product, sum(amount_naira) as amount, count(*) as cnt from payments_log where created_at >= now() - interval '30 days' group by product) t
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
      jsonb_build_object('product', 'business_suite', 'active_count', (select count(*) from businesses where suite_status='active' and (suite_expires_at is null or suite_expires_at > now()))),
      jsonb_build_object('product', 'kobodocs_form', 'active_count', (select count(*) from form_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'kobodocs_survey', 'active_count', (select count(*) from survey_subscriptions where status='active' and (expires_at is null or expires_at > now()))),
      jsonb_build_object('product', 'kobodocs_booking', 'active_count', (select count(*) from booking_subscriptions where status='active' and (expires_at is null or expires_at > now())))
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
    ),

    'free_tool_usage_30d', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tool', tool,
        'views', views,
        'completions', completions,
        'downloads', downloads
      ) order by views desc), '[]'::jsonb)
      from (
        select
          tool,
          count(*) filter (where event_name = 'tool_view') as views,
          count(*) filter (where event_name like '%_completed') as completions,
          count(*) filter (where event_name = 'download_clicked') as downloads
        from tool_usage_events
        where created_at >= now() - interval '30 days'
        group by tool
      ) t
    ),

    'tool_events_today', (select count(*) from tool_usage_events where created_at >= date_trunc('day', now())),
    'tool_events_all_time', (select count(*) from tool_usage_events),

    'daily_series_30d', (
      select jsonb_agg(jsonb_build_object(
        'day', d,
        'signups', coalesce(su.cnt, 0),
        'revenue', coalesce(rv.amt, 0),
        'tool_events', coalesce(te.cnt, 0)
      ) order by d)
      from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') as d
      left join (select created_at::date as day, count(*) as cnt from auth.users where created_at >= now() - interval '30 days' group by 1) su on su.day = d
      left join (select created_at::date as day, sum(amount_naira) as amt from payments_log where created_at >= now() - interval '30 days' group by 1) rv on rv.day = d
      left join (select created_at::date as day, count(*) as cnt from tool_usage_events where created_at >= now() - interval '30 days' group by 1) te on te.day = d
    )
  ) into result;

  return result;
end;
$function$
