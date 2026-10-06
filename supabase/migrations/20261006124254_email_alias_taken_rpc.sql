-- Lets the signup page tell an alias collision apart from other DB errors
-- (GoTrue hides the trigger's message behind "Database error saving new user").
create or replace function public.is_email_alias_taken(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.email is not null
      and public.normalize_email(u.email) = public.normalize_email(p_email)
  )
$$;

revoke execute on function public.is_email_alias_taken(text) from public;
grant execute on function public.is_email_alias_taken(text) to anon, authenticated;
