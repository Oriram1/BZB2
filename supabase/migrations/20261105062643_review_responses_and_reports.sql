-- Replies are visible publicly only after moderation and only while the review is public.
CREATE TABLE public.review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  respondent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  status public.review_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.review_responses TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.review_responses FROM anon, authenticated;
CREATE POLICY "Approved replies on public reviews" ON public.review_responses FOR SELECT TO anon, authenticated
USING (status = 'approved' AND EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND r.status = 'approved' AND r.published_at IS NOT NULL));
CREATE POLICY "Reply owner and admin can read" ON public.review_responses FOR SELECT TO authenticated
USING (respondent_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE INDEX review_responses_pending_idx ON public.review_responses (created_at) WHERE status = 'pending';

CREATE FUNCTION public.submit_review_response(_review_id uuid, _body text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); review_row public.reviews;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_response'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = _review_id FOR SHARE;
  IF NOT FOUND OR review_row.reviewee_id <> actor OR review_row.status <> 'approved' OR review_row.published_at IS NULL THEN RAISE EXCEPTION 'review_unavailable'; END IF;
  INSERT INTO public.review_responses (review_id, respondent_id, body)
    VALUES (_review_id, actor, btrim(_body))
    ON CONFLICT (review_id) DO UPDATE SET body = excluded.body, status = 'pending', updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.submit_review_response(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review_response(uuid,text) TO authenticated;

CREATE FUNCTION public.admin_moderate_review_response(_response_id uuid, _status public.review_status) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); reply public.review_responses;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT * INTO reply FROM public.review_responses WHERE id = _response_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'response not found'; END IF;
  IF reply.status <> 'pending' THEN RAISE EXCEPTION 'response_already_moderated'; END IF;
  UPDATE public.review_responses SET status = _status, updated_at = now() WHERE id = _response_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
    VALUES (actor, 'admin_moderated_review_response', reply.respondent_id, reply.id::text, true, jsonb_build_object('review_id', reply.review_id, 'status', _status));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_moderate_review_response(uuid,public.review_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_review_response(uuid,public.review_status) TO authenticated;

CREATE TABLE public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('abuse','privacy','spam','coercion','irrelevant','other')),
  details text CHECK (char_length(details) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','appealed')),
  decision text CHECK (decision IN ('keep','remove')),
  decision_note text CHECK (char_length(decision_note) <= 500),
  appealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (review_id, reporter_id)
);
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.review_reports TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.review_reports FROM anon, authenticated;
CREATE POLICY "Reporter and admin can read reports" ON public.review_reports FOR SELECT TO authenticated
USING (reporter_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE INDEX review_reports_pending_idx ON public.review_reports (created_at) WHERE status IN ('pending','appealed');

CREATE FUNCTION public.report_review(_review_id uuid, _reason text, _details text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _reason IS NULL OR _reason NOT IN ('abuse','privacy','spam','coercion','irrelevant','other') OR char_length(_details) > 500 THEN RAISE EXCEPTION 'invalid_report'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = _review_id AND status = 'approved' AND published_at IS NOT NULL) THEN RAISE EXCEPTION 'review_unavailable'; END IF;
  INSERT INTO public.review_reports (review_id, reporter_id, reason, details) VALUES (_review_id, actor, _reason, NULLIF(btrim(_details), ''));
END;
$$;
REVOKE ALL ON FUNCTION public.report_review(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_review(uuid,text,text) TO authenticated;

CREATE FUNCTION public.appeal_review_report(_report_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.review_reports;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO item FROM public.review_reports WHERE id = _report_id AND reporter_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report not found'; END IF;
  IF item.status <> 'resolved' OR item.decision <> 'keep' OR item.appealed_at IS NOT NULL THEN RAISE EXCEPTION 'appeal_unavailable'; END IF;
  UPDATE public.review_reports SET status = 'appealed', appealed_at = now() WHERE id = item.id;
END;
$$;
REVOKE ALL ON FUNCTION public.appeal_review_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appeal_review_report(uuid) TO authenticated;

CREATE FUNCTION public.admin_resolve_review_report(_report_id uuid, _decision text, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.review_reports; review_row public.reviews;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('keep','remove') OR _note IS NULL OR char_length(btrim(_note)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  SELECT * INTO item FROM public.review_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND OR item.status NOT IN ('pending','appealed') THEN RAISE EXCEPTION 'report_not_pending'; END IF;
  SELECT * INTO review_row FROM public.reviews WHERE id = item.review_id FOR UPDATE;
  IF _decision = 'remove' AND review_row.status = 'approved' THEN
    UPDATE public.reviews SET status = 'rejected' WHERE id = item.review_id;
  END IF;
  UPDATE public.review_reports SET status = 'resolved', decision = _decision, decision_note = btrim(_note), resolved_at = now() WHERE id = _report_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
    VALUES (actor, 'admin_resolved_review_report', review_row.reviewee_id, item.id::text, true, jsonb_build_object('review_id', item.review_id, 'decision', _decision, 'reason', item.reason));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_review_report(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_review_report(uuid,text,text) TO authenticated;
