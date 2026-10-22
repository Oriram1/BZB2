-- A publisher can rate each accepted worker, and each worker the publisher.
ALTER TABLE public.reviews DROP CONSTRAINT reviews_task_id_reviewer_id_key;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_task_reviewer_reviewee_key
  UNIQUE (task_id, reviewer_id, reviewee_id);

DROP POLICY "reviewer can insert" ON public.reviews;
CREATE POLICY "reviewer can insert" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewer_id <> reviewee_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_applications a ON a.task_id = t.id
      WHERE t.id = reviews.task_id AND t.status = 'completed'
        AND a.status = 'accepted'
        AND ((t.creator_id = reviews.reviewer_id AND a.applicant_id = reviews.reviewee_id)
          OR (t.creator_id = reviews.reviewee_id AND a.applicant_id = reviews.reviewer_id))
    )
  );

-- Keep history readable, but reject new messages once the task is closed.
DROP POLICY "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.tasks t ON t.id = c.task_id
      WHERE c.id = messages.conversation_id
        AND (SELECT auth.uid()) IN (c.participant_1, c.participant_2)
        AND t.status NOT IN ('completed', 'cancelled')
        AND t.archived_at IS NULL
    )
  );
