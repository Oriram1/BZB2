-- Tasks a person saved to come back to. Private to the owner.
CREATE TABLE IF NOT EXISTS public.saved_tasks (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

ALTER TABLE public.saved_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved tasks" ON public.saved_tasks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users save tasks for themselves" ON public.saved_tasks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unsave their own tasks" ON public.saved_tasks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.saved_tasks FROM anon;
GRANT SELECT, INSERT, DELETE ON public.saved_tasks TO authenticated;
