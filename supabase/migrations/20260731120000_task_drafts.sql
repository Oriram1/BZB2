CREATE TABLE IF NOT EXISTS public.task_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_drafts_user_updated_idx ON public.task_drafts(user_id, updated_at DESC);
ALTER TABLE public.task_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own task drafts" ON public.task_drafts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
