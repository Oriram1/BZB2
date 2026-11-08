import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import type { NotificationEvent } from "./notificationEvents.ts";

/** One digest per user per day, however many times the cron fires or retries. */
export async function digestAlreadySent(
  admin: SupabaseClient,
  userId: string,
  event: NotificationEvent,
  date: string,
) {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", event)
    .eq("data->>date", date)
    .limit(1);
  return (data ?? []).length > 0;
}
