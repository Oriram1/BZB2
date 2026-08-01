/**
 * The dispatcher: the single place that decides how a notification reaches a
 * person. Triggered by pg_net right after a row lands in `notifications`.
 *
 * Reads preferences, applies the batching and quiet-hours rules, sends on the
 * enabled channels, and records the outcome in `notification_deliveries`.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { sendEmail } from "../_shared/email.ts";
import {
  CHANNEL_DEFAULTS,
  emailContent,
  pushPayload,
  type NotificationRow,
} from "../_shared/notificationCopy.ts";
import { pushConfigured, sendPush } from "../_shared/push.ts";

const TIME_ZONE = "Asia/Jerusalem";
/** Don't email someone who was looking at the app this recently. */
const ACTIVE_WINDOW_MINUTES = 10;
/** At most one chat email per conversation per hour. */
const CHAT_EMAIL_COOLDOWN_MINUTES = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hourInIsrael() {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TIME_ZONE })
      .format(new Date()),
  );
}

/** Quiet hours wrap midnight (22 → 7), so the comparison has two shapes. */
function inQuietHours(start: number, end: number) {
  const hour = hourInIsrael();
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

async function logDelivery(
  admin: SupabaseClient,
  notificationId: string,
  userId: string,
  channel: "email" | "push",
  status: "sent" | "failed" | "skipped",
  error?: string,
) {
  await admin
    .from("notification_deliveries")
    .upsert(
      { notification_id: notificationId, user_id: userId, channel, status, error: error ?? null },
      { onConflict: "notification_id,channel" },
    );
}

/**
 * Chat is the one event that can fire many times a minute, so email is held
 * back when the person is already in the app or was emailed about this
 * conversation recently. Push still goes out every time (the service worker
 * collapses it by tag).
 */
async function chatEmailAllowed(
  admin: SupabaseClient,
  notification: NotificationRow,
  userId: string,
): Promise<{ allowed: boolean; unreadCount: number }> {
  const conversationId = String(notification.data.conversation_id ?? "");

  const { data: profile } = await admin
    .from("profiles")
    .select("last_active_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: siblings } = await admin
    .from("notifications")
    .select("id, read_at, created_at")
    .eq("user_id", userId)
    .eq("event_type", "message_received")
    .eq("data->>conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(50);

  const unreadCount = (siblings ?? []).filter((row) => !row.read_at).length || 1;

  if (profile?.last_active_at) {
    const idleMs = Date.now() - new Date(profile.last_active_at).getTime();
    if (idleMs < ACTIVE_WINDOW_MINUTES * 60_000) return { allowed: false, unreadCount };
  }

  const cutoff = new Date(Date.now() - CHAT_EMAIL_COOLDOWN_MINUTES * 60_000);
  const recentIds = (siblings ?? [])
    .filter((row) => row.id !== notification.id && new Date(row.created_at) > cutoff)
    .map((row) => row.id);

  if (recentIds.length > 0) {
    const { data: recentEmails } = await admin
      .from("notification_deliveries")
      .select("id")
      .eq("channel", "email")
      .eq("status", "sent")
      .in("notification_id", recentIds)
      .limit(1);
    if ((recentEmails ?? []).length > 0) return { allowed: false, unreadCount };
  }

  return { allowed: true, unreadCount };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("NOTIFY_DISPATCH_SECRET");
  if (!expectedSecret || req.headers.get("x-notify-secret") !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));
  const notificationId = String(body.notification_id ?? "");
  if (!notificationId) return json({ error: "missing_notification_id" }, 400);

  const { data: notification } = await admin
    .from("notifications")
    .select("id, user_id, event_type, data, link")
    .eq("id", notificationId)
    .maybeSingle();

  if (!notification) return json({ error: "not_found" }, 404);

  // pg_net retries on timeout; already-logged channels must not send twice.
  const { data: existing } = await admin
    .from("notification_deliveries")
    .select("channel")
    .eq("notification_id", notificationId);
  const alreadyHandled = new Set((existing ?? []).map((row) => row.channel));

  const userId = notification.user_id as string;
  const row: NotificationRow = {
    id: notification.id,
    event_type: notification.event_type,
    data: (notification.data ?? {}) as Record<string, unknown>,
    link: notification.link,
  };

  const defaults = CHANNEL_DEFAULTS[row.event_type];
  const { data: preference } = await admin
    .from("notification_preferences")
    .select("email_enabled, push_enabled")
    .eq("user_id", userId)
    .eq("event_type", row.event_type)
    .maybeSingle();

  const { data: settings } = await admin
    .from("notification_settings")
    .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
    .eq("user_id", userId)
    .maybeSingle();

  let emailEnabled = preference?.email_enabled ?? defaults.email;
  const pushEnabled = preference?.push_enabled ?? defaults.push;

  if (row.event_type === "message_received" && emailEnabled) {
    const { allowed, unreadCount } = await chatEmailAllowed(admin, row, userId);
    row.data.unread_count = unreadCount;
    if (!allowed) {
      emailEnabled = false;
      await logDelivery(admin, notificationId, userId, "email", "skipped", "batched");
    }
  }

  // ---- Email --------------------------------------------------------------
  if (emailEnabled && !alreadyHandled.has("email")) {
    const { data: userResult } = await admin.auth.admin.getUserById(userId);
    const address = userResult?.user?.email;
    if (!address) {
      await logDelivery(admin, notificationId, userId, "email", "skipped", "no_address");
    } else {
      try {
        await sendEmail({ to: address, content: emailContent(row), tag: row.event_type });
        await logDelivery(admin, notificationId, userId, "email", "sent");
      } catch (error) {
        await logDelivery(
          admin,
          notificationId,
          userId,
          "email",
          "failed",
          error instanceof Error ? error.message : "unknown",
        );
      }
    }
  } else if (!emailEnabled && !alreadyHandled.has("email")) {
    await logDelivery(admin, notificationId, userId, "email", "skipped", "disabled");
  }

  // ---- Push ---------------------------------------------------------------
  if (!alreadyHandled.has("push")) {
    if (!pushEnabled) {
      await logDelivery(admin, notificationId, userId, "push", "skipped", "disabled");
    } else if (!pushConfigured()) {
      await logDelivery(admin, notificationId, userId, "push", "skipped", "not_configured");
    } else if (
      settings?.quiet_hours_enabled &&
      inQuietHours(settings.quiet_hours_start ?? 22, settings.quiet_hours_end ?? 7)
    ) {
      // The notification is still in the bell and the email still went out;
      // only the buzz is withheld.
      await logDelivery(admin, notificationId, userId, "push", "skipped", "quiet_hours");
    } else {
      const { data: subscriptions } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", userId);

      const payload = { ...pushPayload(row), notificationId };
      const results = await Promise.all(
        (subscriptions ?? []).map(async (subscription) => {
          const result = await sendPush(subscription, payload);
          if (!result.ok && result.gone) {
            await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          }
          return result;
        }),
      );

      const delivered = results.some((result) => result.ok);
      if (results.length === 0) {
        await logDelivery(admin, notificationId, userId, "push", "skipped", "no_devices");
      } else {
        await logDelivery(
          admin,
          notificationId,
          userId,
          "push",
          delivered ? "sent" : "failed",
          delivered ? undefined : "all_endpoints_failed",
        );
      }
    }
  }

  return json({ ok: true });
});
