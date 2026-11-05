-- Preserve the role being reviewed even when its task is hidden from public RLS.
ALTER TABLE public.reviews ADD COLUMN reviewee_role text;
UPDATE public.reviews r SET reviewee_role = CASE WHEN t.creator_id = r.reviewee_id THEN 'tasker' ELSE 'bee' END
FROM public.tasks t WHERE t.id = r.task_id;
ALTER TABLE public.reviews ALTER COLUMN reviewee_role SET NOT NULL;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_reviewee_role_check CHECK (reviewee_role IN ('tasker', 'bee'));

CREATE FUNCTION public.set_reviewee_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid;
BEGIN
  SELECT creator_id INTO STRICT owner_id FROM public.tasks WHERE id = NEW.task_id;
  NEW.reviewee_role := CASE WHEN NEW.reviewee_id = owner_id THEN 'tasker' ELSE 'bee' END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_reviewee_role() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER set_reviewee_role BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_reviewee_role();

CREATE VIEW public.user_role_ratings WITH (security_invoker = true) AS
SELECT reviewee_id AS user_id, reviewee_role, round(avg(rating)::numeric, 1) AS avg_rating, count(*) AS review_count
FROM public.reviews WHERE status = 'approved' GROUP BY reviewee_id, reviewee_role;
GRANT SELECT ON public.user_role_ratings TO anon, authenticated;

-- Lock the review so duplicate or conflicting moderator decisions cannot rewrite it.
CREATE OR REPLACE FUNCTION public.admin_set_review_status(_review_id uuid, _status public.review_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_id uuid := auth.uid(); review_row public.reviews;
BEGIN
  IF admin_id IS NULL OR NOT private.has_role(admin_id, 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = _review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF review_row.status <> 'pending' THEN RAISE EXCEPTION 'review_already_moderated'; END IF;
  UPDATE public.reviews SET status = _status WHERE id = _review_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
  VALUES (admin_id, CASE WHEN _status = 'approved' THEN 'admin_approved_review' ELSE 'admin_rejected_review' END,
    review_row.reviewee_id, review_row.id::text, true,
    jsonb_build_object('review_id', review_row.id, 'task_id', review_row.task_id, 'reviewer_id', review_row.reviewer_id, 'rating', review_row.rating, 'previous_status', review_row.status));
END;
$$;
