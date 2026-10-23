-- Admin-only read of the free-month refusals. The tables themselves stay
-- closed to every client role; this is the one way in.
CREATE OR REPLACE FUNCTION public.admin_trial_blocks(_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'daily', coalesce((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day DESC)
        FROM (SELECT * FROM public.trial_abuse_daily ORDER BY day DESC LIMIT 30) d
    ), '[]'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
        FROM (
          SELECT b.id, b.created_at, b.stage, b.matched_kinds, b.user_id,
                 nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') AS user_name,
                 b.matched_user_ids
            FROM public.trial_blocks b
            LEFT JOIN public.profiles p ON p.user_id = b.user_id
           ORDER BY b.created_at DESC
           LIMIT greatest(1, least(coalesce(_limit, 50), 200))
        ) r
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_trial_blocks(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_trial_blocks(INTEGER) TO authenticated;
