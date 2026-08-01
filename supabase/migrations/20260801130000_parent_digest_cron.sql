-- Hourly trigger for the parent digest.
--
-- The job fires every hour and the edge function serves only the parents whose
-- chosen digest hour matches, which keeps per-user scheduling out of Postgres.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_parent_digest()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  digest_url TEXT;
  dispatch_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO digest_url
    FROM vault.decrypted_secrets WHERE name = 'parent_digest_url';
  SELECT decrypted_secret INTO dispatch_secret
    FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';

  -- No config yet: stay quiet rather than logging an error every hour.
  IF digest_url IS NULL OR dispatch_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := digest_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', dispatch_secret
    ),
    timeout_milliseconds := 30000
  );
END;
$$;

SELECT cron.schedule(
  'parent-digest-hourly',
  '5 * * * *',
  $$SELECT public.run_parent_digest()$$
);
