import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Actions we record for ordinary users. Kept as a closed union so the admin
 * screen's Hebrew labels and the call sites can never drift apart.
 */
export type UserActivityAction =
  | "login"
  | "logout"
  | "signup"
  | "task_created"
  | "task_cancelled"
  | "task_deleted"
  | "application_submitted"
  | "application_accepted"
  | "application_rejected"
  | "profile_updated"
  | "role_switched";

type LogOptions = {
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, Json>;
};

/**
 * Records one user action. Deliberately fire-and-forget and silent on failure:
 * a lost audit row must never turn into a failed task submission or a toast in
 * front of the user. Callers do not await it.
 */
export function logUserActivity(
  userId: string | null | undefined,
  action: UserActivityAction,
  options: LogOptions = {},
): void {
  if (!userId) return;

  void supabase
    .from("user_activity_log")
    .insert({
      user_id: userId,
      action,
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      details: options.details ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("activity log write failed", action, error.message);
    });
}
