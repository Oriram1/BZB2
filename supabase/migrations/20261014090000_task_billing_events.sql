-- Notification events for per-task billing and the task review queue.
--
-- ALTER TYPE ... ADD VALUE lives alone in its own migration on purpose: a value
-- added in a transaction cannot be used until that transaction commits.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_approved';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_rejected';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_payment_failed';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_payment_reminder';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_returned_to_draft';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'tasks_hidden';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_plan_changed';
