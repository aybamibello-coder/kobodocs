-- Live testing found a fairness bug: consume_pdf_os_ai_action fires before
-- the model call, so a transient upstream failure (confirmed: real Gemini
-- 503 "high demand") still burns the user's limited quota for a request
-- that produced nothing. This refund function is called from each REMOTE
-- tool's catch block to give that unit back on failure.
create or replace function refund_pdf_os_ai_action(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update pdf_os_usage_current_period
  set ai_actions_used = greatest(ai_actions_used - 1, 0)
  where user_id = p_user_id;
end;
$$;

revoke execute on function refund_pdf_os_ai_action(uuid) from public, anon, authenticated;
grant execute on function refund_pdf_os_ai_action(uuid) to service_role;
