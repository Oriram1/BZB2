-- Auto-purge archived records older than 7 years (privacy policy commitment).
-- Runs once a day at 03:00 UTC to minimize load.

CREATE OR REPLACE FUNCTION public.purge_expired_archives()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.archived_records
  WHERE archived_at < now() - INTERVAL '7 years';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

SELECT cron.schedule(
  'purge-expired-archives',
  '0 3 * * *',
  $$SELECT public.purge_expired_archives()$$
);
