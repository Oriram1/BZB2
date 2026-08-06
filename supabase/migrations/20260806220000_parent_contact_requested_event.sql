-- A parent asking to be added is a notification like any other: it belongs in
-- the child's bell, and it should push.
--
-- ALTER TYPE ... ADD VALUE lives alone in its own migration on purpose. Postgres
-- forbids using a new enum label in the same transaction that adds it, and
-- Supabase runs each migration file in one transaction — so the trigger and the
-- copy that reference this label must land in the *next* file, not this one.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'parent_contact_requested';
