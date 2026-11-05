-- Optional feedback tags (display only; they never change the average).
ALTER TABLE public.reviews ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.reviews ADD CONSTRAINT reviews_tags_allowed CHECK (
  tags <@ ARRAY['on_time','pleasant','as_agreed','thorough','clear_instructions','matched_description','paid_as_agreed']::text[]
  AND cardinality(tags) <= 4
);

DROP FUNCTION public.edit_unpublished_review(uuid, smallint, text);
CREATE FUNCTION public.edit_unpublished_review(_review_id uuid, _rating smallint, _body text, _tags text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); old_review public.reviews;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _rating IS NULL OR _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid_rating'; END IF;
  IF char_length(_body) > 500 THEN RAISE EXCEPTION 'review_too_long'; END IF;
  SELECT * INTO old_review FROM public.reviews WHERE id = _review_id AND reviewer_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF old_review.published_at IS NOT NULL THEN RAISE EXCEPTION 'review_not_editable'; END IF;
  IF EXISTS (SELECT 1 FROM public.review_appeals WHERE review_id = _review_id AND status = 'pending') THEN RAISE EXCEPTION 'appeal_pending'; END IF;
  INSERT INTO private.review_revisions (review_id, old_rating, old_body, old_status)
  VALUES (old_review.id, old_review.rating, old_review.body, old_review.status);
  UPDATE public.reviews SET rating = _rating, body = NULLIF(btrim(_body), ''),
    tags = COALESCE(_tags, tags), status = 'pending', rejection_reason = NULL WHERE id = old_review.id;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_unpublished_review(uuid, smallint, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_unpublished_review(uuid, smallint, text, text[]) TO authenticated;

-- Reminders: one right after completion, one in the last 48 hours of the window.
CREATE TABLE public.review_reminders (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counterpart_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('first','last')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id, counterpart_id, kind)
);
ALTER TABLE public.review_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_reminders FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.send_review_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; sent integer := 0; due text;
BEGIN
  FOR item IN
    SELECT t.id AS task_id, t.name, t.review_window_started_at AS started,
           p.reviewer, p.reviewee
    FROM public.tasks t
    JOIN public.task_applications a ON a.task_id = t.id AND a.status = 'accepted' AND a.archived_at IS NULL
    CROSS JOIN LATERAL (VALUES (t.creator_id, a.applicant_id), (a.applicant_id, t.creator_id)) AS p(reviewer, reviewee)
    WHERE t.status = 'completed' AND t.archived_at IS NULL
      AND t.review_window_started_at IS NOT NULL
      AND now() BETWEEN t.review_window_started_at + interval '1 hour' AND t.review_window_started_at + interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.task_id = t.id AND r.reviewer_id = p.reviewer AND r.reviewee_id = p.reviewee)
  LOOP
    due := CASE WHEN now() >= item.started + interval '12 days' THEN 'last' ELSE 'first' END;
    INSERT INTO public.review_reminders (task_id, user_id, counterpart_id, kind)
    VALUES (item.task_id, item.reviewer, item.reviewee, due) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      PERFORM public.enqueue_notification(item.reviewer, 'review_reminder',
        jsonb_build_object('task_id', item.task_id, 'task_name', item.name, 'kind', due), '/tasks');
      sent := sent + 1;
    END IF;
  END LOOP;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_review_reminders() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('send-review-reminders', '15 * * * *', $$SELECT public.send_review_reminders()$$);

-- Admin-only signals for manual review. These are hints, never automatic penalties.
CREATE FUNCTION public.admin_review_anomalies()
RETURNS TABLE (signal text, subject_id uuid, other_id uuid, detail text, occurrences bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT 'repeat_pair'::text, least(r.reviewer_id, r.reviewee_id), greatest(r.reviewer_id, r.reviewee_id),
         'reviews between the same two people in 30 days'::text, count(*)
  FROM public.reviews r WHERE r.created_at > now() - interval '30 days'
  GROUP BY 2, 3 HAVING count(*) >= 4
  UNION ALL
  SELECT 'burst'::text, r.reviewer_id, NULL::uuid, 'reviews written within 24 hours'::text, count(*)
  FROM public.reviews r WHERE r.created_at > now() - interval '24 hours'
  GROUP BY r.reviewer_id HAVING count(*) >= 5
  UNION ALL
  SELECT 'duplicate_text'::text, NULL::uuid, NULL::uuid, left(r.body, 80), count(*)
  FROM public.reviews r WHERE r.body IS NOT NULL AND char_length(r.body) >= 15
  GROUP BY r.body HAVING count(*) >= 3;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_anomalies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_anomalies() TO authenticated;
