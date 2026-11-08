import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import type { NotificationRow } from "../_shared/notificationEvents.ts";

const CHAT_EMAIL_COOLDOWN_MINUTES = 60;

/**
 * Send the first chat email even when the recipient is active. Suppress only
 * subsequent emails for this conversation during the cooldown. Push still
 * goes out every time (the service worker collapses it by tag).
 */
export async function chatEmailAllowed(
  admin: SupabaseClient,
  notification: NotificationRow,
  userId: string,
): Promise<{ allowed: boolean; unreadCount: number }> {
  const conversationId = String(notification.data.conversation_id ?? "");

  const siblings: { id: string; read_at: string | null; created_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, read_at, created_at")
      .eq("user_id", userId)
      .eq("event_type", "message_received")
      .eq("data->>conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as { id: string; read_at: string | null; created_at: string }[];
    siblings.push(...page);
    if (page.length < 1000) break;
  }

  const unreadCount = (siblings ?? []).filter((row) => !row.read_at).length || 1;

  const cutoff = new Date(Date.now() - CHAT_EMAIL_COOLDOWN_MINUTES * 60_000);
  const recentIds = (siblings ?? [])
    .filter((row) => row.id !== notification.id && new Date(row.created_at) > cutoff)
    .map((row) => row.id);

  if (recentIds.length > 0) {
    const { data: recentEmails, error: deliveryError } = await admin
      .from("notification_deliveries")
      .select("id")
      .eq("channel", "email")
      .eq("status", "sent")
      .in("notification_id", recentIds)
      .limit(1);
    if (deliveryError) throw deliveryError;
    if ((recentEmails ?? []).length > 0) return { allowed: false, unreadCount };
  }

  return { allowed: true, unreadCount };
}
