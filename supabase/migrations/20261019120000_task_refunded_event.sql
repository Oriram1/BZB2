-- Notification event for a refunded task fee. Alone in its own migration: a
-- value added in a transaction cannot be used until that transaction commits.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_refunded';
