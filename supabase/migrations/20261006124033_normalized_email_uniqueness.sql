-- Block duplicate accounts on the same mailbox via email aliases.
-- Gmail ignores dots and anything after '+', so j.ohn+2@gmail.com == john@gmail.com.
-- Dots are stripped only for Gmail; elsewhere a dot can be a different person.

create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null then null
    when split_part(lower(trim(p_email)), '@', 2) in ('gmail.com', 'googlemail.com') then
      replace(split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else
      split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1) || '@' || split_part(lower(trim(p_email)), '@', 2)
  end
$$;

create or replace function public.enforce_unique_normalized_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_norm text := public.normalize_email(new.email);
begin
  if v_norm is null then
    return new;
  end if;

  -- Serialize concurrent signups for the same mailbox.
  perform pg_advisory_xact_lock(hashtext('normalized_email:' || v_norm));

  if exists (
    select 1 from auth.users u
    where u.id <> new.id
      and u.email is not null
      and public.normalize_email(u.email) = v_norm
  ) then
    raise exception 'email_alias_taken' using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_unique_normalized_email() from public, anon, authenticated;

drop trigger if exists enforce_unique_normalized_email on auth.users;
create trigger enforce_unique_normalized_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_unique_normalized_email();
