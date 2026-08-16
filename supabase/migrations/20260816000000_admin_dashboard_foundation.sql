-- Owner-only admin dashboard: foundation tables.
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);
alter table admin_users enable row level security;

create or replace function is_kobodocs_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from admin_users where user_id = p_user_id);
$$;
revoke execute on function is_kobodocs_admin(uuid) from public, anon;
grant execute on function is_kobodocs_admin(uuid) to authenticated, service_role;

create table if not exists payments_log (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null,
  user_id uuid references auth.users(id) on delete set null,
  product text not null,
  plan text,
  amount_naira numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists payments_log_created_at_idx on payments_log(created_at desc);
create index if not exists payments_log_product_idx on payments_log(product);
alter table payments_log enable row level security;
