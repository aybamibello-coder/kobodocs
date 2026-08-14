-- Lock down what the first pdf_os_entitlements migration left too open.

alter table pdf_os_plan_limits enable row level security;

create policy "anyone can read pdf_os plan limits"
  on pdf_os_plan_limits for select
  using (true);

revoke execute on function consume_pdf_os_agent_run(uuid) from public, anon, authenticated;
revoke execute on function consume_pdf_os_ai_action(uuid) from public, anon, authenticated;
grant execute on function consume_pdf_os_agent_run(uuid) to service_role;
grant execute on function consume_pdf_os_ai_action(uuid) to service_role;

alter function consume_pdf_os_agent_run(uuid) set search_path = public;
alter function consume_pdf_os_ai_action(uuid) set search_path = public;
