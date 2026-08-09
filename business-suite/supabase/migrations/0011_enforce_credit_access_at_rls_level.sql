-- SECURITY FIX: Credit & Collections (Business Suite Growth) and the
-- standalone Receivable Manager product share several tables. Access to
-- both was previously enforced ONLY client-side (guard.js's
-- requireGrowthAccess() checking suite_tier='growth', and
-- receivable-manager's own guard checking receivable_subscriptions.status).
-- RLS on the underlying tables only checked business ownership/membership,
-- with zero tier/subscription enforcement — meaning any authenticated
-- business owner could read/write this data directly via the Supabase
-- client, bypassing both paywalls entirely, regardless of what the UI
-- shows or blocks.
--
-- This function is the single source of truth for "does this business have
-- paid access to Credit & Collections / Receivable Manager data", checked
-- at the database level so it can't be bypassed by going around the UI.

create or replace function public.has_credit_access(target_business_id uuid)
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
        -- Business Suite Growth (trial or paid, unexpired)
        (b.suite_tier = 'growth' and (
          (b.suite_status = 'trial' and b.suite_trial_ends_at > now())
          or (b.suite_status = 'active' and b.suite_expires_at > now())
        ))
        -- OR standalone Receivable Manager subscription (unexpired)
        or exists (
          select 1 from public.receivable_subscriptions rs
          where rs.business_id = target_business_id
            and rs.status = 'active'
            and rs.expires_at > now()
        )
      )
  );
$$;

drop policy if exists collection_notes_business_access on public.collection_notes;
create policy collection_notes_business_access on public.collection_notes
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists "Owners manage their receivables" on public.receivables;
create policy receivables_business_access on public.receivables
  for all using (is_business_owner(business_id) and has_credit_access(business_id))
  with check (is_business_owner(business_id) and has_credit_access(business_id));

drop policy if exists promise_to_pay_business_access on public.promise_to_pay;
create policy promise_to_pay_business_access on public.promise_to_pay
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists collection_priority_runs_business_access on public.collection_priority_runs;
create policy collection_priority_runs_business_access on public.collection_priority_runs
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists escalation_actions_business_access on public.escalation_actions;
create policy escalation_actions_business_access on public.escalation_actions
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists receivable_assignments_business_access on public.receivable_assignments;
create policy receivable_assignments_business_access on public.receivable_assignments
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists receivable_disputes_business_access on public.receivable_disputes;
create policy receivable_disputes_business_access on public.receivable_disputes
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists receivable_document_requests_business_access on public.receivable_document_requests;
create policy receivable_document_requests_business_access on public.receivable_document_requests
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));

drop policy if exists "Owners manage their payment events" on public.receivable_payments;
create policy receivable_payments_business_access on public.receivable_payments
  for all using (is_business_owner(business_id) and has_credit_access(business_id))
  with check (is_business_owner(business_id) and has_credit_access(business_id));

drop policy if exists credit_audit_log_business_access on public.credit_audit_log;
create policy credit_audit_log_business_access on public.credit_audit_log
  for all using ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id))
  with check ((is_business_owner(business_id) or is_business_member(business_id)) and has_credit_access(business_id));
