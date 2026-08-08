-- Widen business_members.role platform-wide (affects all of Business
-- Suite, not just Compliance Tracker) from owner/staff to include the
-- role set the Compliance Tracker pitch calls for. 'staff' is kept for
-- backward compatibility with any existing rows/UI copy that assumes it.
alter table public.business_members drop constraint business_members_role_check;
alter table public.business_members add constraint business_members_role_check
  check (role = ANY (ARRAY['owner','staff','accountant','lawyer','hr','finance']));

-- profiles has select-own-only RLS, so a team list can't join to it
-- client-side. Denormalize email/name onto business_members at invite
-- time (via invite-team-member, which already resolves them through the
-- service role) so the existing business_members_select policy is enough
-- for owners/members to see who's on the team without new RLS surface.
alter table public.business_members
  add column member_email text,
  add column member_name text;
