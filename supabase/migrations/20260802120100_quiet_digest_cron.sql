-- Hourly trigger for the quiet-hours digest.
--
-- Same shape as run_parent_digest: fire every hour, and let the edge function
-- serve only the users whose quiet hours end at this hour. Per-user scheduling
-- never enters Postgres.

CREATE OR REPLACE FUNCTION public.run_quiet_digest()
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
    FROM vault.decrypted_secrets WHERE name = 'quiet_digest_url';
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

-- Ten past the hour, clear of the parent digest at five past.
SELECT cron.schedule(
  'quiet-digest-hourly',
  '10 * * * *',
  $$SELECT public.run_quiet_digest()$$
);
