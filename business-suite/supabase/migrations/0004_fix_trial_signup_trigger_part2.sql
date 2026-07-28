-- Fix (part 2): the fix in 0003 removed the trigger on `businesses`, but
-- signup was STILL failing with the same error — because a second,
-- identical legacy gate exists one level deeper. `business_members` has
-- its own BEFORE INSERT trigger (business_member_requires_active_plan /
-- enforce_business_member_requires_active_plan) requiring an active
-- 'business' plan on `profiles` before ANY row can be inserted — including
-- the automatic owner-membership row that business_owner_auto_membership
-- creates for every new business, Business Suite included.
--
-- Confirmed by reproducing the actual insert as the affected user
-- (payvalido@gmail.com) directly against the database: it failed with
-- "Adding team members requires an active Business/Teams subscription"
-- from exactly this trigger, even after 0003.
--
-- This trigger is still genuinely needed elsewhere: business/business.js
-- (a separate personal "Business/Teams" collaboration feature, unrelated
-- to Business Suite) uses the same business_members table to gate
-- inviting OTHER staff behind that plan, via the add-business-member
-- edge function — which always inserts a *different* user as 'staff',
-- never the owner. So the fix exempts only the owner's own membership
-- row rather than removing the check entirely.

create or replace function enforce_business_member_requires_active_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  owner_id uuid;
  owner_plan text;
  owner_expires timestamptz;
begin
  select owner_user_id into owner_id from public.businesses where id = new.business_id;

  -- The owner being added as a member of their own business (via Business
  -- Suite's auto-membership trigger on business creation) is always
  -- allowed — this isn't "adding a team member" in the gated sense.
  if new.user_id = owner_id then
    return new;
  end if;

  select plan, plan_expires_at into owner_plan, owner_expires from public.profiles where id = owner_id;

  if owner_plan != 'business' or owner_expires is null or owner_expires <= now() then
    raise exception 'Adding team members requires an active Business/Teams subscription.';
  end if;

  return new;
end;
$$;
