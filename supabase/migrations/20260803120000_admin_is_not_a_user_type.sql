-- 'admin' is a permission layered on top of an account, not a kind of account.
-- Treating it as a mutually exclusive user type meant an admin could not also be
-- a tasker or a bee, so every role-gated page (/my-tasks, /chat, /create-task)
-- locked admins out of their own data.
--
-- The invariant that actually matters is unchanged: an account has at most one
-- FUNCTIONAL role — tasker, bee, or parent. Those still cannot be mixed, and a
-- user still cannot switch or add one after signup. What is now allowed is
-- 'admin' alongside a functional role.
--
-- 'admin' itself must never be self-assignable: the INSERT policy only checks
-- auth.uid() = user_id, so without this guard any authenticated user could grant
-- themselves admin. It may only be granted server-side (service role / SQL, where
-- auth.uid() is NULL) or by someone who is already an admin.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    IF auth.uid() IS NOT NULL AND NOT private.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'admin_role_not_self_assignable';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND role <> 'admin'
  ) THEN
    RAISE EXCEPTION 'one_role_per_user';
  END IF;

  RETURN NEW;
END;
$$;
