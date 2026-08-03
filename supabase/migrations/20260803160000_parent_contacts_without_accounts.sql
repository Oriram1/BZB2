-- A parent should not have to open an account to keep an eye on their child.
--
-- The existing flow (family_link_codes -> parent_links) gives a parent a full
-- account and a dashboard, and it stays exactly as it is for parents who want
-- that. But it makes an account the price of admission for the common case,
-- which is a parent who only wants to know their child is using the app.
--
-- parent_contacts is that lighter path: an email address attached to a child,
-- with no auth.users row behind it. The child owns the record and can remove it
-- at any time; the parent is a recipient, not a user.

CREATE TABLE IF NOT EXISTS public.parent_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND char_length(email) <= 254),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Written by the notifier to throttle itself. Never set by the child.
  last_notified_at timestamptz,
  UNIQUE (child_user_id, email)
);

CREATE INDEX IF NOT EXISTS parent_contacts_child_idx
  ON public.parent_contacts (child_user_id);

-- Without a ceiling this table is an open mail relay: add address, sign in,
-- repeat. Three covers two parents and a guardian, which is the real ceiling.
CREATE OR REPLACE FUNCTION public.enforce_parent_contact_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.parent_contacts WHERE child_user_id = NEW.child_user_id) >= 3 THEN
    RAISE EXCEPTION 'parent_contact_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parent_contacts_limit ON public.parent_contacts;
CREATE TRIGGER parent_contacts_limit
  BEFORE INSERT ON public.parent_contacts FOR EACH ROW
  EXECUTE FUNCTION public.enforce_parent_contact_limit();

ALTER TABLE public.parent_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Children read own parent contacts" ON public.parent_contacts;
CREATE POLICY "Children read own parent contacts"
  ON public.parent_contacts FOR SELECT TO authenticated
  USING (auth.uid() = child_user_id);

DROP POLICY IF EXISTS "Children add own parent contacts" ON public.parent_contacts;
CREATE POLICY "Children add own parent contacts"
  ON public.parent_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = child_user_id AND last_notified_at IS NULL);

DROP POLICY IF EXISTS "Children remove own parent contacts" ON public.parent_contacts;
CREATE POLICY "Children remove own parent contacts"
  ON public.parent_contacts FOR DELETE TO authenticated
  USING (auth.uid() = child_user_id);

-- Deliberately no UPDATE policy and no UPDATE grant: last_notified_at is the
-- notifier's throttle, and a child who could reset it could turn every sign-in
-- back into an email. Nothing but service_role writes this table after insert.
GRANT SELECT, INSERT, DELETE ON public.parent_contacts TO authenticated;
GRANT ALL ON public.parent_contacts TO service_role;

REVOKE ALL ON FUNCTION public.enforce_parent_contact_limit() FROM PUBLIC;
