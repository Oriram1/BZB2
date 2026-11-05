-- Reviews and replies are published automatically when an automatic screen finds
-- nothing wrong. Low ratings and flagged text wait for a person. Anything the
-- screen cannot decide (provider down, missing config) stays pending: fail closed.
ALTER TABLE public.reviews
  ADD COLUMN screening text NOT NULL DEFAULT 'pending_ai'
    CHECK (screening IN ('pending_ai', 'clean', 'flagged', 'manual_low_rating')),
  ADD COLUMN screening_reason text CHECK (char_length(screening_reason) <= 300);
ALTER TABLE public.review_responses
  ADD COLUMN screening text NOT NULL DEFAULT 'pending_ai'
    CHECK (screening IN ('pending_ai', 'clean', 'flagged')),
  ADD COLUMN screening_reason text CHECK (char_length(screening_reason) <= 300);
-- Everything that exists today was already decided by a person.
UPDATE public.reviews SET screening = 'clean' WHERE status <> 'pending';
UPDATE public.review_responses SET screening = 'clean' WHERE status <> 'pending';

-- Clients can never choose their own screening result.
CREATE FUNCTION public.force_pending_screening() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.screening := 'pending_ai';
  NEW.screening_reason := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.force_pending_screening() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reviews_force_screening BEFORE INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.force_pending_screening();
CREATE TRIGGER review_responses_force_screening BEFORE INSERT ON public.review_responses FOR EACH ROW EXECUTE FUNCTION public.force_pending_screening();

CREATE FUNCTION private.request_screening(_kind text, _id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE target text; secret text;
BEGIN
  SELECT decrypted_secret INTO target FROM vault.decrypted_secrets WHERE name = 'review_screen_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';
  IF target IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := target, body := jsonb_build_object('kind', _kind, 'id', _id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    timeout_milliseconds := 5000);
END;
$$;
REVOKE ALL ON FUNCTION private.request_screening(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.screen_review_after_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.rating <= 2 THEN
    UPDATE public.reviews SET screening = 'manual_low_rating' WHERE id = NEW.id;
  ELSIF NEW.body IS NULL THEN
    UPDATE public.reviews SET status = 'approved', screening = 'clean', rejection_reason = NULL WHERE id = NEW.id;
  ELSE
    PERFORM private.request_screening('review', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.screen_review_after_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_screening AFTER INSERT OR UPDATE ON public.reviews
FOR EACH ROW WHEN (NEW.status = 'pending' AND NEW.screening = 'pending_ai') EXECUTE FUNCTION public.screen_review_after_write();

CREATE FUNCTION public.screen_response_after_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.request_screening('response', NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.screen_response_after_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_response_screening AFTER INSERT OR UPDATE ON public.review_responses
FOR EACH ROW WHEN (NEW.status = 'pending' AND NEW.screening = 'pending_ai') EXECUTE FUNCTION public.screen_response_after_write();

-- Called only by the review-screen function (service role).
CREATE FUNCTION public.system_screen_review(_review_id uuid, _verdict text, _reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.reviews;
BEGIN
  IF _verdict NOT IN ('clean', 'flagged') THEN RAISE EXCEPTION 'invalid_verdict'; END IF;
  SELECT * INTO item FROM public.reviews WHERE id = _review_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(item.task_id::text || least(item.reviewer_id, item.reviewee_id)::text || greatest(item.reviewer_id, item.reviewee_id)::text, 0));
  SELECT * INTO item FROM public.reviews WHERE id = _review_id FOR UPDATE;
  IF item.status <> 'pending' OR item.screening <> 'pending_ai' OR item.rating <= 2 THEN RETURN; END IF;
  IF _verdict = 'clean' THEN
    UPDATE public.reviews SET status = 'approved', screening = 'clean', rejection_reason = NULL WHERE id = _review_id;
  ELSE
    UPDATE public.reviews SET screening = 'flagged', screening_reason = left(btrim(_reason), 300) WHERE id = _review_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.system_screen_review(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_screen_review(uuid, text, text) TO service_role;

CREATE FUNCTION public.system_screen_review_response(_response_id uuid, _verdict text, _reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.review_responses;
BEGIN
  IF _verdict NOT IN ('clean', 'flagged') THEN RAISE EXCEPTION 'invalid_verdict'; END IF;
  SELECT * INTO item FROM public.review_responses WHERE id = _response_id FOR UPDATE;
  IF NOT FOUND OR item.status <> 'pending' OR item.screening <> 'pending_ai' THEN RETURN; END IF;
  IF _verdict = 'clean' THEN
    UPDATE public.review_responses SET status = 'approved', screening = 'clean', updated_at = now() WHERE id = _response_id;
  ELSE
    UPDATE public.review_responses SET screening = 'flagged', screening_reason = left(btrim(_reason), 300), updated_at = now() WHERE id = _response_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.system_screen_review_response(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_screen_review_response(uuid, text, text) TO service_role;

-- Edits and new replies are screened again.
CREATE OR REPLACE FUNCTION public.edit_unpublished_review(_review_id uuid, _rating smallint, _body text, _tags text[] DEFAULT NULL)
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
  UPDATE public.reviews SET rating = _rating, body = NULLIF(btrim(_body), ''), tags = COALESCE(_tags, tags),
    status = 'pending', screening = 'pending_ai', screening_reason = NULL, rejection_reason = NULL WHERE id = old_review.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_review_response(_review_id uuid, _body text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); review_row public.reviews;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_response'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = _review_id FOR SHARE;
  IF NOT FOUND OR review_row.reviewee_id <> actor OR review_row.status <> 'approved' OR review_row.published_at IS NULL THEN RAISE EXCEPTION 'review_unavailable'; END IF;
  INSERT INTO public.review_responses (review_id, respondent_id, body)
    VALUES (_review_id, actor, btrim(_body))
    ON CONFLICT (review_id) DO UPDATE SET body = excluded.body, status = 'pending', screening = 'pending_ai', screening_reason = NULL, updated_at = now();
END;
$$;

-- Retry anything the screen has not decided after a few minutes (provider hiccup, retried pg_net).
CREATE FUNCTION public.retry_review_screening() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; total integer := 0;
BEGIN
  FOR item IN SELECT id FROM public.reviews WHERE status = 'pending' AND screening = 'pending_ai' AND rating > 2 AND body IS NOT NULL
      AND created_at < now() - interval '3 minutes' ORDER BY created_at LIMIT 50 LOOP
    PERFORM private.request_screening('review', item.id); total := total + 1;
  END LOOP;
  FOR item IN SELECT id FROM public.review_responses WHERE status = 'pending' AND screening = 'pending_ai'
      AND updated_at < now() - interval '3 minutes' ORDER BY created_at LIMIT 50 LOOP
    PERFORM private.request_screening('response', item.id); total := total + 1;
  END LOOP;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_review_screening() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('retry-review-screening', '*/10 * * * *', $$SELECT public.retry_review_screening()$$);

-- An admin can take down a review that is already public. The author is notified
-- with the reason and can appeal; averages update because only approved reviews count.
CREATE FUNCTION public.admin_remove_review(_review_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.reviews;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO item FROM public.reviews WHERE id = _review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(item.task_id::text || least(item.reviewer_id, item.reviewee_id)::text || greatest(item.reviewer_id, item.reviewee_id)::text, 0));
  SELECT * INTO item FROM public.reviews WHERE id = _review_id FOR UPDATE;
  IF item.status <> 'approved' THEN RAISE EXCEPTION 'review_not_approved'; END IF;
  UPDATE public.reviews SET status = 'rejected', rejection_reason = btrim(_reason) WHERE id = _review_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
  VALUES (actor, 'admin_removed_review', item.reviewee_id, item.id::text, true,
    jsonb_build_object('review_id', item.id, 'task_id', item.task_id, 'rating', item.rating, 'was_published', item.published_at IS NOT NULL, 'reason', btrim(_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_remove_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_review(uuid, text) TO authenticated;

-- Reviews already waiting when this ships follow the same rules.
UPDATE public.reviews SET screening = 'manual_low_rating' WHERE status = 'pending' AND rating <= 2;
UPDATE public.reviews SET status = 'approved', screening = 'clean' WHERE status = 'pending' AND screening = 'pending_ai' AND rating > 2 AND body IS NULL;
