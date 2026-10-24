CREATE TABLE public.edge_request_counters (
  scope text NOT NULL,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (scope, window_start)
);
CREATE INDEX edge_request_counters_retention ON public.edge_request_counters(window_start);
ALTER TABLE public.edge_request_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_request_counters FROM anon, authenticated;
GRANT ALL ON public.edge_request_counters TO service_role;
COMMENT ON TABLE public.edge_request_counters IS 'Backend-only quota counters; no client policies by design.';

CREATE FUNCTION public.consume_geocode_quota(_user_id uuid)
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
    ('geocode:global:day', date_trunc('day', now_at), 2000, interval '1 day'),
    ('geocode:' || _user_id || ':day', date_trunc('day', now_at), 200, interval '1 day'),
    ('geocode:' || _user_id || ':minute', date_trunc('minute', now_at), 20, interval '1 minute')
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
REVOKE ALL ON FUNCTION public.consume_geocode_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_geocode_quota(uuid) TO service_role;

-- Unknown IDs are untrusted: one aggregate per hour, at most five sample IDs.
CREATE TABLE public.payment_webhook_unknown_buckets (
  bucket_start timestamptz PRIMARY KEY,
  attempts bigint NOT NULL DEFAULT 1,
  sample_ids text[] NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_webhook_unknown_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_webhook_unknown_buckets FROM anon, authenticated;
GRANT ALL ON public.payment_webhook_unknown_buckets TO service_role;
COMMENT ON TABLE public.payment_webhook_unknown_buckets IS 'Backend-only bounded webhook audit; rolling 7-day retention.';

CREATE FUNCTION public.record_unknown_payment_webhook(_low_profile_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _low_profile_id IS NULL OR length(_low_profile_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_low_profile_id';
  END IF;
  DELETE FROM public.payment_webhook_unknown_buckets WHERE bucket_start < date_trunc('hour', now()) - interval '7 days';
  INSERT INTO public.payment_webhook_unknown_buckets AS bucket(bucket_start, sample_ids)
  VALUES (date_trunc('hour', now()), ARRAY[_low_profile_id])
  ON CONFLICT (bucket_start) DO UPDATE SET
    attempts = bucket.attempts + 1,
    last_seen_at = now(),
    sample_ids = CASE WHEN cardinality(bucket.sample_ids) < 5 AND NOT (_low_profile_id = ANY(bucket.sample_ids))
      THEN array_append(bucket.sample_ids, _low_profile_id) ELSE bucket.sample_ids END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_unknown_payment_webhook(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_unknown_payment_webhook(text) TO service_role;
