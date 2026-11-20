-- A publisher must never apply to their own task, including through the API.
ALTER POLICY "Bees can apply" ON public.task_applications TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = applicant_id
  AND private.task_is_live(task_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.tasks AS task
    WHERE task.id = task_id AND task.creator_id = (SELECT auth.uid())
  )
);
