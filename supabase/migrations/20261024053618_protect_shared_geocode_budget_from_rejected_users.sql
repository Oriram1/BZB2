-- Reject user-limit excess before touching the shared provider budget.
CREATE OR REPLACE FUNCTION public.consume_geocode_quota(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  bucket record;
  consumed integer;
  now_at timestamptz := now();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  DELETE FROM public.edge_request_counters WHERE window_start < date_trunc('day', now_at) - interval '2 days';
  -- Fixed limits live on the server. Atomic upserts serialize concurrent callers.
  FOR bucket IN SELECT * FROM (VALUES
    ('geocode:' || _user_id || ':minute', date_trunc('minute', now_at), 20, interval '1 minute'),
    ('geocode:' || _user_id || ':day', date_trunc('day', now_at), 200, interval '1 day'),
    ('geocode:global:day', date_trunc('day', now_at), 2000, interval '1 day')
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
