-- Notifications are produced by trusted triggers, never arbitrary API callers.
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, public.notification_event, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, public.notification_event, jsonb, text) TO service_role;

-- Retention cleanup belongs to the scheduler, not public RPC callers.
REVOKE EXECUTE ON FUNCTION public.purge_expired_archives() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_archives() TO service_role;
