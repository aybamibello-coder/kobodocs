-- Admin-only manual plan assignment for KoboDocs Form / Survey, since
-- neither product has payment integration or self-serve checkout yet.

create or replace function admin_set_form_plan(p_email text, p_plan text, p_expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not is_kobodocs_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select id into v_user_id from profiles where email = p_email;
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'No account found for that email.');
  end if;

  insert into form_subscriptions (user_id, plan, status, expires_at)
  values (v_user_id, p_plan, 'active', p_expires_at)
  on conflict (user_id) do update
    set plan = excluded.plan, status = 'active', expires_at = excluded.expires_at, updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function admin_set_form_plan(text, text, timestamptz) from public;
grant execute on function admin_set_form_plan(text, text, timestamptz) to authenticated;

create or replace function admin_set_survey_plan(p_email text, p_plan text, p_expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not is_kobodocs_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select id into v_user_id from profiles where email = p_email;
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'No account found for that email.');
  end if;

  insert into survey_subscriptions (user_id, plan, status, expires_at)
  values (v_user_id, p_plan, 'active', p_expires_at)
  on conflict (user_id) do update
    set plan = excluded.plan, status = 'active', expires_at = excluded.expires_at, updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function admin_set_survey_plan(text, text, timestamptz) from public;
grant execute on function admin_set_survey_plan(text, text, timestamptz) to authenticated;

-- Lookup used by the admin screen to show a user's current plan before changing it.
create or replace function admin_get_form_survey_plan(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_form jsonb;
  v_survey jsonb;
begin
  if not is_kobodocs_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select id into v_user_id from profiles where email = p_email;
  if v_user_id is null then
    return jsonb_build_object('found', false);
  end if;

  select to_jsonb(fs) - 'user_id' into v_form from form_subscriptions fs where fs.user_id = v_user_id;
  select to_jsonb(ss) - 'user_id' into v_survey from survey_subscriptions ss where ss.user_id = v_user_id;

  return jsonb_build_object('found', true, 'form', coalesce(v_form, jsonb_build_object('plan', 'free')), 'survey', coalesce(v_survey, jsonb_build_object('plan', 'free')));
end;
$$;

revoke all on function admin_get_form_survey_plan(text) from public;
grant execute on function admin_get_form_survey_plan(text) to authenticated;
