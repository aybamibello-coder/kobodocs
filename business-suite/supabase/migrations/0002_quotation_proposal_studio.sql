-- Quotation & Proposal Studio (Business Suite Growth tier)
-- Run this against the KoboDocs Supabase project (vwmzulzluaxedkozxjfy),
-- after 0001_credit_collections.sql. Adds templates, version history,
-- public approval links, and an audit log for quotations. Growth-gating
-- happens in the app (business.suite_tier check / guard.js) — Starter
-- keeps using the existing basic quotes list/convert-to-invoice untouched.

-- ---------- 0. documents.quote_status needs 'declined' ----------
-- The existing check constraint only allowed sent/viewed/accepted/expired.
-- The public proposal page needs a distinct declined state.
alter table documents drop constraint if exists documents_quote_status_check;
alter table documents add constraint documents_quote_status_check
  check (quote_status = any (array['sent'::text, 'viewed'::text, 'accepted'::text, 'declined'::text, 'expired'::text]));

-- ---------- 1. Reusable quote templates ----------
create table if not exists quote_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  proposal_sections jsonb not null default '[]',
  default_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists quote_templates_business_idx on quote_templates(business_id);

-- ---------- 2. Version history ----------
-- A snapshot is written every time a quote is created or edited/resent,
-- so a client can be shown "what changed" and staff can see prior drafts.
create table if not exists quote_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  quote_id uuid not null references documents(id) on delete cascade,
  version_number int not null,
  snapshot jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);

create index if not exists quote_versions_quote_idx on quote_versions(quote_id);

-- ---------- 3. Public share links for online approval ----------
-- Token is a text hex string, matching the existing client_portal_links
-- convention (encode(gen_random_bytes(24), 'hex')), not a uuid.
create table if not exists quote_share_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  quote_id uuid not null references documents(id) on delete cascade unique,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  view_count int not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists quote_share_links_quote_idx on quote_share_links(quote_id);

-- ---------- 4. Audit log ----------
-- actor_user_id is nullable: staff actions (create/edit/convert) are
-- attributed to a user, client actions (view/approve/decline) are not
-- authenticated and go through the RPCs below instead.
create table if not exists quote_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  quote_id uuid references documents(id) on delete set null,
  actor_type text not null default 'staff' check (actor_type in ('staff', 'client', 'system')),
  actor_user_id uuid references auth.users(id),
  action text not null, -- e.g. 'quote_created','quote_edited','converted_to_invoice','proposal_viewed','proposal_accepted','proposal_declined'
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists quote_audit_log_business_idx on quote_audit_log(business_id);
create index if not exists quote_audit_log_quote_idx on quote_audit_log(quote_id);

-- ---------- RLS ----------
-- Uses the project's existing is_business_owner()/is_business_member()
-- helpers, matching the pattern already used on businesses/clients/documents.
-- Growth-tier gating for these features happens in the app, not in RLS,
-- consistent with how Growth is gated everywhere else in this codebase.
alter table quote_templates enable row level security;
alter table quote_versions enable row level security;
alter table quote_share_links enable row level security;
alter table quote_audit_log enable row level security;

create policy "quote_templates_business_access"
  on quote_templates for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));

create policy "quote_versions_business_access"
  on quote_versions for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));

create policy "quote_share_links_business_access"
  on quote_share_links for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));

create policy "quote_audit_log_business_access"
  on quote_audit_log for all
  using (is_business_owner(business_id) or is_business_member(business_id))
  with check (is_business_owner(business_id) or is_business_member(business_id));

-- No public SELECT/UPDATE policy on quote_share_links, documents, clients,
-- or quote_audit_log for anon — the two RPC functions below are the only
-- way an unauthenticated client-facing link can read or write anything,
-- and both run as SECURITY DEFINER scoped strictly to the row matching
-- the token.

-- ---------- RPC: read a proposal by its public token ----------
create or replace function get_quote_proposal_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link quote_share_links%rowtype;
  v_quote documents%rowtype;
  v_client clients%rowtype;
  v_business businesses%rowtype;
  v_result jsonb;
begin
  select * into v_link from quote_share_links where token = p_token;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_quote from documents where id = v_link.quote_id;
  select * into v_client from clients where id = v_quote.client_id;
  select * into v_business from businesses where id = v_link.business_id;

  update quote_share_links
    set view_count = view_count + 1,
        first_viewed_at = coalesce(first_viewed_at, now()),
        last_viewed_at = now()
    where id = v_link.id;

  if v_quote.quote_status = 'sent' then
    update documents set quote_status = 'viewed' where id = v_quote.id;
  end if;

  insert into quote_audit_log (business_id, client_id, quote_id, actor_type, action, details)
  values (v_link.business_id, v_quote.client_id, v_quote.id, 'client', 'proposal_viewed', '{}');

  v_result := jsonb_build_object(
    'business_name', v_business.name,
    'brand_logo_url', v_business.brand_logo_url,
    'brand_color', v_business.brand_color,
    'client_name', coalesce(v_client.name, 'there'),
    'quote_status', (select quote_status from documents where id = v_quote.id),
    'due_date', v_quote.due_date,
    'data', v_quote.data
  );

  return v_result;
end;
$$;

-- ---------- RPC: client accepts or declines a proposal ----------
create or replace function respond_to_quote_proposal(p_token text, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link quote_share_links%rowtype;
  v_quote documents%rowtype;
begin
  if p_response not in ('accepted', 'declined') then
    return jsonb_build_object('error', 'invalid_response');
  end if;

  select * into v_link from quote_share_links where token = p_token;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_quote from documents where id = v_link.quote_id;
  if v_quote.quote_status in ('accepted', 'declined', 'expired') then
    return jsonb_build_object('error', 'already_final', 'quote_status', v_quote.quote_status);
  end if;

  update documents set quote_status = p_response where id = v_quote.id;
  update quote_share_links set responded_at = now() where id = v_link.id;

  insert into quote_audit_log (business_id, client_id, quote_id, actor_type, action, details)
  values (v_link.business_id, v_quote.client_id, v_quote.id, 'client',
          case when p_response = 'accepted' then 'proposal_accepted' else 'proposal_declined' end, '{}');

  return jsonb_build_object('ok', true, 'quote_status', p_response);
end;
$$;

grant execute on function get_quote_proposal_data(text) to anon, authenticated;
grant execute on function respond_to_quote_proposal(text, text) to anon, authenticated;
