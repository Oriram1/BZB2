-- Two things a parent without an account could not do until now:
--   1. choose which emails they get, and
--   2. put their own address on the list.
--
-- (1) is five booleans on parent_contacts. (2) is a request queue, because the
-- page that asks is public and the child must stay the owner of the list.

-- ---------------------------------------------------------------------------
-- 1. Per-contact email preferences
-- ---------------------------------------------------------------------------
-- Explicit columns rather than jsonb, mirroring notification_settings: the
-- notifier filters on these in SQL, and a typo in a jsonb key fails silently
-- while a typo in a column name fails loudly.
--
-- Defaults are the three low-frequency events. completed and cancelled are off
-- because a parent who gets mail on every task mutes the channel, and a muted
-- channel delivers nothing at all.
ALTER TABLE public.parent_contacts
  ADD COLUMN IF NOT EXISTS notify_signin    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_accepted  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_digest    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_cancelled boolean NOT NULL DEFAULT false;

-- Still no UPDATE policy and no UPDATE grant to authenticated: the parent edits
-- these through the parent-prefs function (service_role, share token as auth),
-- and the child was never meant to edit them at all. See the note at the foot
-- of 20260803160000_parent_contacts_without_accounts.sql.

-- ---------------------------------------------------------------------------
-- 2. Pending requests from the public parent view
-- ---------------------------------------------------------------------------
-- Deliberately NOT a status column on parent_contacts. An unapproved address
-- sitting in that table is one forgotten WHERE clause away from being mailed,
-- and the address belongs to someone the child never approved. A separate table
-- makes that mistake unrepresentable rather than merely unlikely.
CREATE TABLE IF NOT EXISTS public.parent_contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND char_length(email) <= 254),
  requested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_user_id, email)
);

CREATE INDEX IF NOT EXISTS parent_contact_requests_child_idx
  ON public.parent_contact_requests (child_user_id);

-- The public endpoint rate-limits per token, but a child with three tokens in
-- circulation could still be buried. Three pending mirrors the three-contact
-- ceiling: enough for two parents and a guardian, and no more.
CREATE OR REPLACE FUNCTION public.enforce_parent_request_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.parent_contact_requests
      WHERE child_user_id = NEW.child_user_id) >= 3 THEN
    RAISE EXCEPTION 'parent_request_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parent_contact_requests_limit ON public.parent_contact_requests;
CREATE TRIGGER parent_contact_requests_limit
  BEFORE INSERT ON public.parent_contact_requests FOR EACH ROW
  EXECUTE FUNCTION public.enforce_parent_request_limit();

ALTER TABLE public.parent_contact_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Children read own parent requests" ON public.parent_contact_requests;
CREATE POLICY "Children read own parent requests"
  ON public.parent_contact_requests FOR SELECT TO authenticated
  USING (auth.uid() = child_user_id);

DROP POLICY IF EXISTS "Children clear own parent requests" ON public.parent_contact_requests;
CREATE POLICY "Children clear own parent requests"
  ON public.parent_contact_requests FOR DELETE TO authenticated
  USING (auth.uid() = child_user_id);

-- No INSERT policy and no INSERT grant, to anon or to authenticated. The only
-- writer is request-parent-contact, which holds service_role and has verified a
-- share token first. A browser that could insert here directly would be able to
-- queue a stranger's address against any child whose id it guessed.
GRANT SELECT, DELETE ON public.parent_contact_requests TO authenticated;
GRANT ALL ON public.parent_contact_requests TO service_role;

REVOKE ALL ON FUNCTION public.enforce_parent_request_limit() FROM PUBLIC;
