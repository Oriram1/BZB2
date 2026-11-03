-- The task assistant calls a paid model per message. Same bounded counters as
-- geocoding: user limits are checked before the shared daily budget, so one
-- user hitting their ceiling never eats into everyone else's.
CREATE FUNCTION public.consume_task_assistant_quota(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  bucket record;
  consumed integer;
  now_at timestamptz := now();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  DELETE FROM public.edge_request_counters WHERE window_start < date_trunc('day', now_at) - interval '2 days';
  FOR bucket IN SELECT * FROM (VALUES
    ('task-assistant:' || _user_id || ':minute', date_trunc('minute', now_at), 10, interval '1 minute'),
    ('task-assistant:' || _user_id || ':day', date_trunc('day', now_at), 60, interval '1 day'),
    ('task-assistant:global:day', date_trunc('day', now_at), 3000, interval '1 day')
  ) AS limits(scope, window_start, ceiling, duration)
  LOOP
    consumed := NULL;
    INSERT INTO public.edge_request_counters AS counter(scope, window_start, requests)
    VALUES (bucket.scope, bucket.window_start, 1)
    ON CONFLICT (scope, window_start) DO UPDATE SET requests = counter.requests + 1
      WHERE counter.requests < bucket.ceiling
    RETURNING requests INTO consumed;
    IF consumed IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'retry_after',
        greatest(1, ceil(extract(epoch FROM bucket.window_start + bucket.duration - now_at))::integer));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('allowed', true, 'retry_after', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_task_assistant_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_task_assistant_quota(uuid) TO service_role;
