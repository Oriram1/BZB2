-- New completions have a 14-day review window; legacy tasks retain their history.
ALTER TABLE public.tasks ADD COLUMN review_window_started_at timestamptz;
CREATE FUNCTION public.set_review_window_start() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.review_window_started_at := CASE WHEN NEW.status = 'completed' THEN now() ELSE NULL END;
  ELSIF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    NEW.review_window_started_at := now();
  ELSE
    NEW.review_window_started_at := OLD.review_window_started_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_review_window_start() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER set_review_window_start BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_review_window_start();

ALTER TABLE public.reviews ADD COLUMN blind_until timestamptz;
ALTER TABLE public.reviews ADD COLUMN published_at timestamptz;
-- Never hide or resend previously published reviews.
UPDATE public.reviews SET published_at = COALESCE(updated_at, created_at) WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.set_reviewee_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task_row public.tasks;
BEGIN
  SELECT * INTO STRICT task_row FROM public.tasks WHERE id = NEW.task_id;
  NEW.reviewee_role := CASE WHEN NEW.reviewee_id = task_row.creator_id THEN 'tasker' ELSE 'bee' END;
  NEW.blind_until := task_row.review_window_started_at + interval '14 days';
  NEW.published_at := NULL;
  RETURN NEW;
END;
$$;

ALTER POLICY "reviewer can insert" ON public.reviews WITH CHECK (
  reviewer_id = (SELECT auth.uid()) AND status = 'pending' AND reviewer_id <> reviewee_id
  AND (blind_until IS NULL OR now() <= blind_until)
  AND EXISTS (
    SELECT 1 FROM public.tasks t JOIN public.task_applications a ON a.task_id = t.id
    WHERE t.id = reviews.task_id AND t.status = 'completed' AND t.archived_at IS NULL
      AND a.status = 'accepted' AND a.archived_at IS NULL
      AND ((t.creator_id = reviews.reviewer_id AND a.applicant_id = reviews.reviewee_id)
        OR (t.creator_id = reviews.reviewee_id AND a.applicant_id = reviews.reviewer_id))
  )
);
DROP POLICY IF EXISTS "Authenticated readers" ON public.reviews;
DROP POLICY IF EXISTS "Public approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "anyone can read approved" ON public.reviews;
DROP POLICY IF EXISTS "reviewer can read own" ON public.reviews;
DROP POLICY IF EXISTS "admins can read all reviews" ON public.reviews;
CREATE POLICY "Published reviews are public" ON public.reviews FOR SELECT TO anon, authenticated
USING (status = 'approved' AND published_at IS NOT NULL);
CREATE POLICY "Review authors and admins can read" ON public.reviews FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = reviewer_id OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE OR REPLACE VIEW public.user_avg_ratings WITH (security_invoker = true) AS
SELECT reviewee_id AS user_id, round(avg(rating)::numeric, 1) AS avg_rating, count(*) AS review_count
FROM public.reviews WHERE status = 'approved' AND published_at IS NOT NULL GROUP BY reviewee_id;
CREATE OR REPLACE VIEW public.user_role_ratings WITH (security_invoker = true) AS
SELECT reviewee_id AS user_id, reviewee_role, round(avg(rating)::numeric, 1) AS avg_rating, count(*) AS review_count
FROM public.reviews WHERE status = 'approved' AND published_at IS NOT NULL GROUP BY reviewee_id, reviewee_role;

CREATE OR REPLACE FUNCTION public.notify_review_approved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task_name text;
BEGIN
  SELECT name INTO task_name FROM public.tasks WHERE id = NEW.task_id;
  PERFORM public.enqueue_notification(NEW.reviewee_id, 'review_approved',
    jsonb_build_object('review_id', NEW.id, 'task_id', NEW.task_id, 'task_name', task_name, 'rating', NEW.rating), '/profile');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_approved() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS review_approved_notification ON public.reviews;
CREATE TRIGGER review_published_notification AFTER UPDATE OF published_at ON public.reviews
FOR EACH ROW WHEN (OLD.published_at IS NULL AND NEW.published_at IS NOT NULL)
EXECUTE FUNCTION public.notify_review_approved();

-- Pairing is per task and per two people; one worker never delays another.
CREATE FUNCTION public.release_review_pair(_task_id uuid, _first uuid, _second uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_task_id::text || least(_first, _second)::text || greatest(_first, _second)::text, 0));
  UPDATE public.reviews r SET published_at = now()
  WHERE r.task_id = _task_id AND r.published_at IS NULL AND r.status = 'approved'
    AND ((r.reviewer_id = _first AND r.reviewee_id = _second) OR (r.reviewer_id = _second AND r.reviewee_id = _first))
    AND (r.blind_until IS NULL OR r.blind_until <= now() OR EXISTS (
      SELECT 1 FROM public.reviews other WHERE other.task_id = r.task_id
        AND other.reviewer_id = r.reviewee_id AND other.reviewee_id = r.reviewer_id
    ));
END;
$$;
REVOKE ALL ON FUNCTION public.release_review_pair(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.release_review_pair_after_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.release_review_pair(NEW.task_id, NEW.reviewer_id, NEW.reviewee_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.release_review_pair_after_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_release_after_change AFTER INSERT OR UPDATE OF status ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.release_review_pair_after_change();

CREATE FUNCTION public.release_expired_reviews() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record;
BEGIN
  FOR item IN SELECT DISTINCT task_id, reviewer_id, reviewee_id FROM public.reviews
    WHERE status = 'approved' AND published_at IS NULL AND blind_until <= now()
  LOOP
    PERFORM public.release_review_pair(item.task_id, item.reviewer_id, item.reviewee_id);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.release_expired_reviews() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('release-expired-reviews', '*/10 * * * *', $$SELECT public.release_expired_reviews()$$);
