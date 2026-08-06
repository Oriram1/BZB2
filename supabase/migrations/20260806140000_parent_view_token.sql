-- Add a random view token to parent_contacts so parents can view child status
-- without logging in. Token is auto-generated on insert.

alter table parent_contacts
  add column view_token uuid default gen_random_uuid() not null;

create unique index parent_contacts_view_token_idx on parent_contacts (view_token);

-- ponytail: edge function uses service role, no anon RLS policy needed.
