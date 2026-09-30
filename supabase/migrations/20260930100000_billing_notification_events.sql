-- Billing events on the notification spine, so subscription mail and push go
-- through the same dispatcher (preferences, quiet hours, delivery log) as every
-- other notification instead of a second sender.
--
-- ALTER TYPE ... ADD VALUE lives alone in its own migration on purpose: a value
-- added in a transaction cannot be used until that transaction commits.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_renewal_reminder';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_payment_succeeded';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_payment_failed';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_subscription_canceled';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_subscription_ended';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'billing_refunded';
