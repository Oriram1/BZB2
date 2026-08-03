import { supabase } from "@/integrations/supabase/client";

/**
 * Lets a child's parent contacts know the child signed in.
 *
 * Fire-and-forget and silent on failure, for the same reason as the activity
 * log: a parent's courtesy email must never be the thing that keeps someone
 * from getting into the app.
 *
 * Deciding whether an email is actually due is the server's job — it throttles
 * to one per contact per day and ignores accounts that are not children — so
 * this is safe to call on every sign-in.
 */
export function notifyParentsOfSignIn() {
  void supabase.functions.invoke("notify-parent-signin").catch(() => {
    /* Nothing the person signing in can do about it, so nothing is shown. */
  });
}
