-- A task can be hidden from the public after a worker was accepted. Both
-- conversation participants still need to read it to load and use their chat.
CREATE POLICY "Conversation participants can view their tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.task_id = tasks.id
        AND ((SELECT auth.uid()) = c.participant_1 OR (SELECT auth.uid()) = c.participant_2)
    )
  );
