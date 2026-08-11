-- Logs each escalation action taken against a client's overdue balance
-- (formal notice generated, referred to collections/legal) so the team
-- can see escalation history and avoid re-triggering the same stage
-- action repeatedly. Friendly reminders and AI negotiation messages are
-- already logged via credit_audit_log / reminder_sent, so this table only
-- covers the two stronger, less-frequent actions.
create table if not exists escalation_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  stage int not null check (stage between 1 and 4),
  action_type text not null check (action_type in ('formal_notice', 'collections_referral')),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists escalation_actions_client_idx
  on escalation_actions(client_id, created_at desc);
create index if not exists escalation_actions_business_idx
  on escalation_actions(business_id, created_at desc);

alter table escalation_actions enable row level security;

create policy "escalation_actions_business_access"
  on escalation_actions for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));
