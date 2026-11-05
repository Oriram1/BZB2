CREATE TABLE public.review_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  decision text CHECK (decision IN ('restore','keep_removed')),
  decision_note text CHECK (char_length(decision_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.review_appeals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.review_appeals TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.review_appeals FROM anon, authenticated;
CREATE POLICY "Review author and admin can read appeals" ON public.review_appeals FOR SELECT TO authenticated
USING (author_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE INDEX review_appeals_pending_idx ON public.review_appeals (created_at) WHERE status = 'pending';

CREATE FUNCTION public.appeal_review_decision(_review_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); review_row public.reviews;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = _review_id AND reviewer_id = actor FOR SHARE;
  IF NOT FOUND OR review_row.status <> 'rejected' THEN RAISE EXCEPTION 'appeal_unavailable'; END IF;
  INSERT INTO public.review_appeals (review_id, author_id, reason) VALUES (_review_id, actor, btrim(_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.appeal_review_decision(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appeal_review_decision(uuid,text) TO authenticated;

CREATE FUNCTION public.admin_resolve_review_appeal(_appeal_id uuid, _decision text, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.review_appeals; review_row public.reviews;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('restore','keep_removed') OR _note IS NULL OR char_length(btrim(_note)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  SELECT * INTO item FROM public.review_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND OR item.status <> 'pending' THEN RAISE EXCEPTION 'appeal_not_pending'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = item.review_id FOR UPDATE;
  IF NOT FOUND OR review_row.status <> 'rejected' THEN RAISE EXCEPTION 'review_not_rejected'; END IF;
  IF _decision = 'restore' THEN UPDATE public.reviews SET status = 'approved', rejection_reason = NULL WHERE id = item.review_id; END IF;
  UPDATE public.review_appeals SET status = 'resolved', decision = _decision, decision_note = btrim(_note), resolved_at = now() WHERE id = item.id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
    VALUES (actor, 'admin_resolved_review_appeal', item.author_id, item.id::text, true, jsonb_build_object('review_id', item.review_id, 'decision', _decision));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_review_appeal(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_review_appeal(uuid,text,text) TO authenticated;

-- The reason for removing a previously published review is visible to its author.
CREATE OR REPLACE FUNCTION public.admin_resolve_review_report(_report_id uuid, _decision text, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.review_reports; review_row public.reviews;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('keep','remove') OR _note IS NULL OR char_length(btrim(_note)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  SELECT * INTO item FROM public.review_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND OR item.status NOT IN ('pending','appealed') THEN RAISE EXCEPTION 'report_not_pending'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = item.review_id FOR UPDATE;
  IF _decision = 'remove' AND review_row.status = 'approved' THEN
    UPDATE public.reviews SET status = 'rejected', rejection_reason = btrim(_note) WHERE id = item.review_id;
  END IF;
  UPDATE public.review_reports SET status = 'resolved', decision = _decision, decision_note = btrim(_note), resolved_at = now() WHERE id = _report_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
    VALUES (actor, 'admin_resolved_review_report', review_row.reviewee_id, item.id::text, true, jsonb_build_object('review_id', item.review_id, 'decision', _decision, 'reason', item.reason));
END;
$$;

CREATE FUNCTION public.notify_review_report_resolved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_notification(NEW.reporter_id, 'review_report_resolved', jsonb_build_object('report_id', NEW.id, 'decision', NEW.decision), '/profile');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_report_resolved() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_report_resolved_notification AFTER UPDATE OF status ON public.review_reports
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'resolved') EXECUTE FUNCTION public.notify_review_report_resolved();

CREATE FUNCTION public.notify_review_appeal_resolved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_notification(NEW.author_id, 'review_appeal_resolved', jsonb_build_object('review_id', NEW.review_id, 'decision', NEW.decision), '/profile');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_appeal_resolved() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_appeal_resolved_notification AFTER UPDATE OF status ON public.review_appeals
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'resolved') EXECUTE FUNCTION public.notify_review_appeal_resolved();

-- Avoid leaving an appeal pending against content that the author has replaced.
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
  IF EXISTS (SELECT 1 FROM public.review_appeals WHERE review_id = _review_id AND status = 'pending') THEN RAISE EXCEPTION 'appeal_pending'; END IF;
  INSERT INTO private.review_revisions (review_id, old_rating, old_body, old_status)
  VALUES (old_review.id, old_review.rating, old_review.body, old_review.status);
  UPDATE public.reviews SET rating = _rating, body = NULLIF(btrim(_body), ''), status = 'pending', rejection_reason = NULL WHERE id = old_review.id;
END;
$$;
