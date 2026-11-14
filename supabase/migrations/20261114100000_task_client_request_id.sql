-- Idempotent task creation. The app sends one random id per publish attempt and
-- reuses it on every retry, so a double tap or a retry after a timeout cannot
-- create the same task twice. The unique index is what enforces it.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_creator_client_request_uidx
  ON public.tasks (creator_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
