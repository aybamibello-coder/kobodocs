-- CORRECTION to 0011_enforce_credit_access_at_rls_level.sql: that fix
-- landed just before 0016_receivable_two_tier_plans.sql, and didn't
-- account for it — has_credit_access() only checked status='active',
-- which would have wrongly locked out every business currently on the
-- new 21-day Growth trial (status='trialing'). It also treated every
-- gated table as one group, but the app itself (receivable.js's
-- `isGrowth` flag) only gates collection_priority_runs,
-- escalation_actions, and receivable_assignments behind Growth
-- specifically — receivables, collection_notes, promise_to_pay,
-- credit_audit_log, receivable_payments, receivable_disputes, and
-- receivable_document_requests are available on Starter too. Splitting
-- into two functions to match that exactly.

drop function if exists public.has_credit_access(uuid) cascade;

create or replace function public.has_receivable_base_access(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
      and (
        (b.suite_tier = 'growth' and (
          (b.suite_status = 'trial' and b.suite_trial_ends_at > now())
          or (b.suite_status = 'active' and b.suite_expires_at > now())
        ))
        or exists (
          select 1 from public.receivable_subscriptions rs
          where rs.business_id = target_business_id
            and rs.expires_at > now()
            and rs.status in ('active', 'trialing')
        )
      )
  );
$$;

create or replace function public.has_receivable_growth_access(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
      and (
        (b.suite_tier = 'growth' and (
          (b.suite_status = 'trial' and b.suite_trial_ends_at > now())
          or (b.suite_status = 'active' and b.suite_expires_at > now())
        ))
        or exists (
          select 1 from public.receivable_subscriptions rs
          where rs.business_id = target_business_id
            and rs.expires_at > now()
            and (rs.status = 'trialing' or (rs.status = 'active' and rs.plan = 'growth'))
        )
      )
  );
$$;

-- Base-access tables (Starter or Growth, either product)
drop policy if exists collection_notes_business_access on public.collection_notes;
create policy collection_notes_business_access on public.collection_notes
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id));

drop policy if exists receivables_business_access on public.receivables;
create policy receivables_business_access on public.receivables
  for all using (is_business_owner(business_id) and has_receivable_base_access(business_id))
  with check (is_business_owner(business_id) and has_receivable_base_access(business_id));

drop policy if exists promise_to_pay_business_access on public.promise_to_pay;
create policy promise_to_pay_business_access on public.promise_to_pay
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id));

drop policy if exists credit_audit_log_business_access on public.credit_audit_log;
create policy credit_audit_log_business_access on public.credit_audit_log
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id));

drop policy if exists receivable_payments_business_access on public.receivable_payments;
create policy receivable_payments_business_access on public.receivable_payments
  for all using (is_business_owner(business_id) and has_receivable_base_access(business_id))
  with check (is_business_owner(business_id) and has_receivable_base_access(business_id));

drop policy if exists receivable_disputes_business_access on public.receivable_disputes;
create policy receivable_disputes_business_access on public.receivable_disputes
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id));

drop policy if exists receivable_document_requests_business_access on public.receivable_document_requests;
create policy receivable_document_requests_business_access on public.receivable_document_requests
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_base_access(business_id));

-- Growth-only tables
drop policy if exists collection_priority_runs_business_access on public.collection_priority_runs;
create policy collection_priority_runs_business_access on public.collection_priority_runs
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_growth_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_growth_access(business_id));

drop policy if exists escalation_actions_business_access on public.escalation_actions;
create policy escalation_actions_business_access on public.escalation_actions
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_growth_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_growth_access(business_id));

drop policy if exists receivable_assignments_business_access on public.receivable_assignments;
create policy receivable_assignments_business_access on public.receivable_assignments
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_growth_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_receivable_growth_access(business_id));
