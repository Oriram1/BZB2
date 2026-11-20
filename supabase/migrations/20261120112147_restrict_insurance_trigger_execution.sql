-- Trigger execution does not require callers to execute the trigger function.
REVOKE EXECUTE ON FUNCTION public.task_insurance_gate() FROM PUBLIC, anon, authenticated;

-- Evaluate the accepted relationship without re-entering the task and
-- conversation row policies, which otherwise recurse into one another.
CREATE OR REPLACE FUNCTION private.can_open_task_conversation(
  _task_id uuid, _first uuid, _second uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IN (_first, _second) AND EXISTS (
    SELECT 1 FROM public.tasks AS task
    JOIN public.task_applications AS application ON application.task_id = task.id
    WHERE task.id = _task_id AND application.status = 'accepted' AND application.archived_at IS NULL
      AND ((task.creator_id = _first AND application.applicant_id = _second)
        OR (task.creator_id = _second AND application.applicant_id = _first))
  );
$$;
REVOKE ALL ON FUNCTION private.can_open_task_conversation(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_open_task_conversation(uuid, uuid, uuid) TO authenticated;
ALTER POLICY "Authenticated users can create conversations" ON public.conversations TO authenticated
WITH CHECK (private.can_open_task_conversation(task_id, participant_1, participant_2));
