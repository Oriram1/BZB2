-- Publishing a task failed for anyone who used the description field as the
-- form invited them to.
--
-- The publish form asks for "תיאור קצר (עד 120 תווים)", sets maxLength={120}
-- and shows a live n/120 counter. The table, unchanged since the first
-- migration, still capped short_desc at 40. Every description between 41 and
-- 120 characters passed the client, reached Postgres, and was rejected by the
-- CHECK — surfacing as a raw constraint error in a toast and no published task.
--
-- The form is the intended spec here, so the column follows it. The constraint
-- is given a name this time so the next change to it does not have to look it
-- up by definition.
DO $$
DECLARE
  existing_constraint text;
BEGIN
  SELECT con.conname INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'tasks'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%short_desc%';

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', existing_constraint);
  END IF;
END $$;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_short_desc_length CHECK (char_length(short_desc) <= 120);
