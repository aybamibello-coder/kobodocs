-- Password/access-code protection for KoboDocs Form & Survey.
--
-- Security design: settings.accessCode must never be sent to an
-- unauthenticated visitor before they've proven they know it -- and
-- neither should the actual field/question definitions, since those
-- are the thing being protected. So:
--   * get_public_form/get_public_survey now strip accessCode from the
--     returned settings and, when an access code is set, omit
--     fields/questions entirely and return only requires_access_code:true.
--   * A new unlock_form/unlock_survey RPC takes the slug + submitted
--     code and, only on a match, returns the full payload (same shape
--     the old get_public_form/get_public_survey always returned).

create or replace function get_public_form(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form forms%rowtype;
  v_has_code boolean;
begin
  select * into v_form from forms where slug = p_slug and status = 'published';
  if not found then
    return null;
  end if;

  v_has_code := coalesce(length(trim(v_form.settings->>'accessCode')), 0) > 0;

  if v_has_code then
    return jsonb_build_object(
      'id', v_form.id,
      'title', v_form.title,
      'requires_access_code', true,
      'settings', (v_form.settings - 'accessCode'),
      'response_count', v_form.response_count
    );
  end if;

  return jsonb_build_object(
    'id', v_form.id,
    'title', v_form.title,
    'description', v_form.description,
    'fields', v_form.fields,
    'settings', v_form.settings,
    'requires_access_code', false,
    'response_count', v_form.response_count
  );
end;
$$;

create or replace function unlock_form(p_slug text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form forms%rowtype;
begin
  select * into v_form from forms where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This form is not accepting responses right now.');
  end if;

  if coalesce(v_form.settings->>'accessCode', '') = '' or v_form.settings->>'accessCode' != p_code then
    return jsonb_build_object('success', false, 'error', 'That access code is incorrect.');
  end if;

  return jsonb_build_object(
    'success', true,
    'id', v_form.id,
    'title', v_form.title,
    'description', v_form.description,
    'fields', v_form.fields,
    'settings', (v_form.settings - 'accessCode'),
    'response_count', v_form.response_count
  );
end;
$$;

revoke all on function unlock_form(text, text) from public;
grant execute on function unlock_form(text, text) to anon, authenticated;

create or replace function get_public_survey(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
  v_has_code boolean;
begin
  select * into v_survey from surveys where slug = p_slug and status = 'published';
  if not found then
    return null;
  end if;

  v_has_code := coalesce(length(trim(v_survey.settings->>'accessCode')), 0) > 0;

  if v_has_code then
    return jsonb_build_object(
      'id', v_survey.id,
      'title', v_survey.title,
      'requires_access_code', true,
      'settings', (v_survey.settings - 'accessCode'),
      'response_count', v_survey.response_count
    );
  end if;

  return jsonb_build_object(
    'id', v_survey.id,
    'title', v_survey.title,
    'description', v_survey.description,
    'questions', v_survey.questions,
    'settings', v_survey.settings,
    'requires_access_code', false,
    'response_count', v_survey.response_count
  );
end;
$$;

create or replace function unlock_survey(p_slug text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
begin
  select * into v_survey from surveys where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This survey is not accepting responses right now.');
  end if;

  if coalesce(v_survey.settings->>'accessCode', '') = '' or v_survey.settings->>'accessCode' != p_code then
    return jsonb_build_object('success', false, 'error', 'That access code is incorrect.');
  end if;

  return jsonb_build_object(
    'success', true,
    'id', v_survey.id,
    'title', v_survey.title,
    'description', v_survey.description,
    'questions', v_survey.questions,
    'settings', (v_survey.settings - 'accessCode'),
    'response_count', v_survey.response_count
  );
end;
$$;

revoke all on function unlock_survey(text, text) from public;
grant execute on function unlock_survey(text, text) to anon, authenticated;
