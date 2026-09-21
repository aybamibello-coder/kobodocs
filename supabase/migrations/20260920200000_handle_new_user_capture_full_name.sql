-- The signup trigger never read full_name from user metadata (only
-- business_name), even though profiles.full_name already existed as a
-- column -- so it was always null regardless of what the signup form
-- collected. Fixed alongside adding a required "Full name" field to the
-- signup form itself.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, business_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'business_name');
  return new;
end;
$function$
