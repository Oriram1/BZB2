-- Admin can block a user until a given timestamp.
-- blocked_until NULL = not blocked. A past timestamp = effectively not blocked.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_until  timestamptz,
  ADD COLUMN IF NOT EXISTS block_reason   text;

-- Helper: returns true when the user is currently blocked
CREATE OR REPLACE FUNCTION public.is_user_blocked(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = uid
      AND blocked_until IS NOT NULL
      AND blocked_until > now()
  );
$$;
