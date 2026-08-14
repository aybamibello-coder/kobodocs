-- Fix mutable search_path (SECURITY DEFINER footgun) and lock these RPCs
-- down to service_role only -- they must never be callable by an arbitrary
-- authenticated user with someone else's p_user_id.

alter function consume_pdf_os_agent_run(uuid) set search_path = public, pg_temp;
alter function consume_pdf_os_ai_action(uuid) set search_path = public, pg_temp;

revoke execute on function consume_pdf_os_agent_run(uuid) from public, anon, authenticated;
revoke execute on function consume_pdf_os_ai_action(uuid) from public, anon, authenticated;
grant execute on function consume_pdf_os_agent_run(uuid) to service_role;
grant execute on function consume_pdf_os_ai_action(uuid) to service_role;
