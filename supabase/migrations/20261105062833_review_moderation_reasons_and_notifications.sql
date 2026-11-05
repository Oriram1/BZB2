ALTER TABLE public.reviews ADD COLUMN rejection_reason text CHECK (char_length(rejection_reason) <= 500);

CREATE FUNCTION public.admin_moderate_review(_review_id uuid, _status public.review_status, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.reviews;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _status IS NULL OR _status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF _status = 'rejected' AND (_reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO item FROM public.reviews WHERE id = _review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  -- Take the same pair lock as publication before row locks, preventing pair deadlocks.
  PERFORM pg_advisory_xact_lock(hashtextextended(item.task_id::text || least(item.reviewer_id, item.reviewee_id)::text || greatest(item.reviewer_id, item.reviewee_id)::text, 0));
  SELECT * INTO item FROM public.reviews WHERE id = _review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF item.status <> 'pending' THEN RAISE EXCEPTION 'review_already_moderated'; END IF;
  UPDATE public.reviews SET status = _status, rejection_reason = CASE WHEN _status = 'rejected' THEN btrim(_reason) ELSE NULL END WHERE id = _review_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
  VALUES (actor, CASE WHEN _status = 'approved' THEN 'admin_approved_review' ELSE 'admin_rejected_review' END,
    item.reviewee_id, item.id::text, true,
    jsonb_build_object('review_id', item.id, 'task_id', item.task_id, 'reviewer_id', item.reviewer_id, 'rating', item.rating, 'previous_status', item.status, 'reason', CASE WHEN _status = 'rejected' THEN btrim(_reason) ELSE NULL END));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_moderate_review(uuid,public.review_status,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_review(uuid,public.review_status,text) TO authenticated;

-- Keep older clients able to approve while requiring a reason for all rejections.
CREATE OR REPLACE FUNCTION public.admin_set_review_status(_review_id uuid, _status public.review_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status IS DISTINCT FROM 'approved'::public.review_status THEN RAISE EXCEPTION 'reason_required'; END IF;
  PERFORM public.admin_moderate_review(_review_id, _status, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_unpublished_review(_review_id uuid, _rating smallint, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); old_review public.reviews;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _rating IS NULL OR _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid_rating'; END IF;
  IF char_length(_body) > 500 THEN RAISE EXCEPTION 'review_too_long'; END IF;
  SELECT * INTO old_review FROM public.reviews WHERE id = _review_id AND reviewer_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF old_review.published_at IS NOT NULL THEN RAISE EXCEPTION 'review_not_editable'; END IF;
  INSERT INTO private.review_revisions (review_id, old_rating, old_body, old_status)
  VALUES (old_review.id, old_review.rating, old_review.body, old_review.status);
  UPDATE public.reviews SET rating = _rating, body = NULLIF(btrim(_body), ''), status = 'pending', rejection_reason = NULL WHERE id = old_review.id;
END;
$$;

CREATE FUNCTION public.notify_review_rejected() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_notification(NEW.reviewer_id, 'review_rejected',
    jsonb_build_object('review_id', NEW.id, 'task_id', NEW.task_id, 'reason', NEW.rejection_reason,
      'removed', NEW.published_at IS NOT NULL), '/profile');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_rejected() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_rejected_notification AFTER UPDATE OF status ON public.reviews
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'rejected')
EXECUTE FUNCTION public.notify_review_rejected();

CREATE FUNCTION public.notify_review_response_approved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; subject_id uuid;
BEGIN
  SELECT reviewer_id, reviewee_id INTO target, subject_id FROM public.reviews WHERE id = NEW.review_id AND status = 'approved' AND published_at IS NOT NULL;
  IF target IS NOT NULL THEN
    PERFORM public.enqueue_notification(target, 'review_response_approved', jsonb_build_object('review_id', NEW.review_id), '/profile/' || subject_id::text);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_response_approved() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_response_approved_notification AFTER UPDATE OF status ON public.review_responses
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
EXECUTE FUNCTION public.notify_review_response_approved();
