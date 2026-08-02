-- The morning summary of everything quiet hours held back overnight.
--
-- Alone in its own migration on purpose: Postgres refuses to use a newly added
-- enum value in the transaction that added it, and keeping this by itself means
-- no later edit to a shared file can accidentally trip that rule.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'quiet_hours_digest';
