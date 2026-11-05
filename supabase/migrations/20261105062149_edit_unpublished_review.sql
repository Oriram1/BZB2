-- Revisions are private and cannot be read directly by clients.
CREATE TABLE private.review_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  old_rating smallint NOT NULL,
  old_body text,
  old_status public.review_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.review_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE private.review_revisions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.edit_unpublished_review(_review_id uuid, _rating smallint, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); old_review public.reviews;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _rating IS NULL OR _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid_rating'; END IF;
  IF char_length(_body) > 500 THEN RAISE EXCEPTION 'review_too_long'; END IF;
  SELECT * INTO old_review FROM public.reviews WHERE id = _review_id AND reviewer_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF old_review.published_at IS NOT NULL OR old_review.status = 'rejected' THEN RAISE EXCEPTION 'review_not_editable'; END IF;
  INSERT INTO private.review_revisions (review_id, old_rating, old_body, old_status)
  VALUES (old_review.id, old_review.rating, old_review.body, old_review.status);
  -- Changed content must be moderated again, including a previously approved draft.
  UPDATE public.reviews SET rating = _rating, body = NULLIF(btrim(_body), ''), status = 'pending' WHERE id = old_review.id;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_unpublished_review(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_unpublished_review(uuid, smallint, text) TO authenticated;
