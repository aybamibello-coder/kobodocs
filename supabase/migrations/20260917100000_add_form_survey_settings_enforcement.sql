-- Adds settings-based enforcement (response limit, closing date) and a
-- honeypot anti-bot parameter to the public submit RPCs, and includes
-- response_count in the public get RPCs so the fill page can show an
-- accurate "closed" state before the visitor starts filling it in.
-- All settings live in the existing `settings` jsonb column -- no new
-- columns needed.

create or replace function get_public_form(p_slug text)
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
    return null;
  end if;
  return jsonb_build_object(
    'id', v_form.id,
    'title', v_form.title,
    'description', v_form.description,
    'fields', v_form.fields,
    'settings', v_form.settings,
    'response_count', v_form.response_count
  );
end;
$$;

create or replace function submit_form_response(p_slug text, p_answers jsonb, p_honeypot text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form forms%rowtype;
  v_limit integer;
  v_closes timestamptz;
begin
  -- Honeypot: a hidden field real visitors never fill. If it's non-empty,
  -- pretend success without writing anything, so bots don't learn to look
  -- elsewhere for the tell.
  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return jsonb_build_object('success', true);
  end if;

  select * into v_form from forms where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This form is not accepting responses right now.');
  end if;

  v_closes := nullif(v_form.settings->>'closesAt', '')::timestamptz;
  if v_closes is not null and now() > v_closes then
    return jsonb_build_object('success', false, 'error', 'This form closed to new responses on ' || to_char(v_closes, 'DD Mon YYYY') || '.');
  end if;

  v_limit := nullif(v_form.settings->>'responseLimit', '')::integer;
  if v_limit is not null and v_form.response_count >= v_limit then
    return jsonb_build_object('success', false, 'error', 'This form has reached its maximum number of responses.');
  end if;

  insert into form_responses (form_id, answers) values (v_form.id, p_answers);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function submit_form_response(text, jsonb, text) from public;
grant execute on function submit_form_response(text, jsonb, text) to anon, authenticated;

create or replace function get_public_survey(p_slug text)
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
    return null;
  end if;
  return jsonb_build_object(
    'id', v_survey.id,
    'title', v_survey.title,
    'description', v_survey.description,
    'questions', v_survey.questions,
    'settings', v_survey.settings,
    'response_count', v_survey.response_count
  );
end;
$$;

create or replace function submit_survey_response(p_slug text, p_answers jsonb, p_honeypot text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
  v_limit integer;
  v_closes timestamptz;
begin
  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return jsonb_build_object('success', true);
  end if;

  select * into v_survey from surveys where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This survey is not accepting responses right now.');
  end if;

  v_closes := nullif(v_survey.settings->>'closesAt', '')::timestamptz;
  if v_closes is not null and now() > v_closes then
    return jsonb_build_object('success', false, 'error', 'This survey closed to new responses on ' || to_char(v_closes, 'DD Mon YYYY') || '.');
  end if;

  v_limit := nullif(v_survey.settings->>'responseLimit', '')::integer;
  if v_limit is not null and v_survey.response_count >= v_limit then
    return jsonb_build_object('success', false, 'error', 'This survey has reached its maximum number of responses.');
  end if;

  insert into survey_responses (survey_id, answers) values (v_survey.id, p_answers);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function submit_survey_response(text, jsonb, text) from public;
grant execute on function submit_survey_response(text, jsonb, text) to anon, authenticated;

-- Old 2-arg overloads are superseded by the 3-arg versions above (Postgres
-- allows both to coexist since they differ by signature); drop them so old
-- cached clients fail loudly instead of silently skipping the new checks.
drop function if exists submit_form_response(text, jsonb);
drop function if exists submit_survey_response(text, jsonb);
