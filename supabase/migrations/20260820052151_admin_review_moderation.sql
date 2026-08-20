-- The moderation queue could never work: reviews exposes SELECT only for approved
-- rows and for the reviewer's own, and has no UPDATE policy at all. So the admin
-- panel listed nothing and approving silently updated zero rows. Reads open up to
-- admins; the status change goes through a definer function so the only field a
-- moderator can touch is the status, and every decision lands in the audit log.
DROP POLICY IF EXISTS "admins can read all reviews" ON public.reviews;
CREATE POLICY "admins can read all reviews"
  ON public.reviews
  FOR SELECT
  USING (private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_set_review_status(
  _review_id UUID,
  _status public.review_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_id UUID := auth.uid();
  review_row public.reviews;
BEGIN
  IF admin_id IS NULL OR NOT private.has_role(admin_id, 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Moderation decides on a submission; re-deciding an already published or
  -- rejected review would silently rewrite history.
  IF _status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT * INTO review_row FROM public.reviews WHERE id = _review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;

  UPDATE public.reviews SET status = _status WHERE id = _review_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_user_id, target_identifier, success, details
  )
  VALUES (
    admin_id,
    CASE WHEN _status = 'approved' THEN 'admin_approved_review' ELSE 'admin_rejected_review' END,
    review_row.reviewee_id,
    review_row.id::text,
    true,
    jsonb_build_object(
      'review_id', review_row.id,
      'task_id', review_row.task_id,
      'reviewer_id', review_row.reviewer_id,
      'rating', review_row.rating,
      'previous_status', review_row.status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_review_status(UUID, public.review_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_review_status(UUID, public.review_status) TO authenticated;
