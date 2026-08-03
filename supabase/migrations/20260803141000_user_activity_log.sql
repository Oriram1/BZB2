-- Activity trail for ordinary users. admin_audit_log stays what it is: a record
-- of what admins did. This table records what everyone else did, so the admin
-- screen can answer "what is happening in the app" and not only "what did I do".
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_activity_log TO authenticated;
GRANT ALL ON public.user_activity_log TO service_role;

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins read the trail; a user must not be able to browse anyone's
-- history, including their own — it is an audit record, not a feature.
CREATE POLICY "Admins can view user activity log"
  ON public.user_activity_log FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- Writes are client-side, so the row is pinned to the caller: nobody can forge
-- activity under someone else's id.
CREATE POLICY "Users can log their own activity"
  ON public.user_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_activity_log_created_at_idx
  ON public.user_activity_log (created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_log_user_id_idx
  ON public.user_activity_log (user_id, created_at DESC);
