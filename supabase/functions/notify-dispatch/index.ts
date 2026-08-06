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
import { formFor } from "../_shared/gender.ts";
import { pushConfigured, sendPush } from "../_shared/push.ts";
import { inQuietWindow, israelHour, resolveQuietHours } from "../_shared/quietHours.ts";
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

/**
 * A parent contact has no auth.users row, so nothing about them can ride the
 * notifications table (keyed by user_id) — but every event they care about is
 * already a notification for their child. Rather than a second queue and a
 * second set of triggers, the dispatcher forwards from here.
 *
 * Maps the child's event to the parent-facing copy and the switch that gates it.
 */
const PARENT_FANOUT: Record<string, { pref: string; event: NotificationRow["event_type"] }> = {
  application_decided: { pref: "notify_accepted", event: "parent_child_accepted" },
  task_completed: { pref: "notify_completed", event: "parent_child_completed" },
  task_cancelled: { pref: "notify_cancelled", event: "parent_child_cancelled" },
};

async function fanOutToParentContacts(
  admin: SupabaseClient,
  row: NotificationRow,
  userId: string,
) {
  const mapping = PARENT_FANOUT[row.event_type];
  if (!mapping) return;

  // A rejection is the child's business, not their parent's. Only an acceptance
  // is forwarded.
  if (row.event_type === "application_decided" && row.data.status !== "accepted") return;

  // task_completed is enqueued to the task's creator as well as its workers. A
  // parent watching a child should hear about tasks the child *did*, not tasks
  // the child posted, so the creator's copy of the event is dropped here.
  if (row.event_type === "task_completed") {
    const taskId = String(row.data.task_id ?? "");
    if (!taskId) return;
    const { data: task } = await admin
      .from("tasks")
      .select("creator_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task || task.creator_id === userId) return;
  }

  const { data: contacts } = await admin
    .from("parent_contacts")
    .select("id, email, view_token")
    .eq("child_user_id", userId)
    .eq(mapping.pref, true);

  if (!contacts?.length) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, gender")
    .eq("user_id", userId)
    .maybeSingle();

  // Left empty when unknown so the copy layer picks the gendered fallback
  // rather than this file hard-coding a slash form.
  const childName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  for (const contact of contacts) {
    try {
      await sendEmail({
        to: contact.email,
        tag: mapping.event,
        content: emailContent({
          id: contact.id,
          event_type: mapping.event,
          data: {
            ...row.data,
            child_name: childName,
            child_gender: profile?.gender,
            view_token: contact.view_token,
          },
          link: `/parent/view/${contact.view_token}`,
        }),
      });
    } catch (error) {
      // One bad address must not stop the rest, and must never fail the
      // dispatch for the child themselves — their email already went out above.
      console.error("parent_fanout_failed", {
        contactId: contact.id,
        event: mapping.event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
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

  const emailEnabled = preference?.email_enabled ?? defaults.email;
  const pushEnabled = preference?.push_enabled ?? defaults.push;

  const quiet = resolveQuietHours(settings ?? null);
  const isQuiet = quiet.enabled && inQuietWindow(israelHour(new Date()), quiet.start, quiet.end);

  // One variable, one write. The previous shape logged "batched" and then
  // immediately overwrote it with "disabled" via the same upsert key, which is
  // why every skipped email in the log claims the wrong reason.
  let emailSkipReason: string | null = emailEnabled ? null : "disabled";

  if (!emailSkipReason && row.event_type === "message_received") {
    // Chat is the one event quiet hours withhold on both channels: it is never
    // urgent, and it is the only event this digest collects. Everything else
    // keeps its email, because family_link_code expires in ten minutes and a
    // code delivered at 07:00 is a dead code.
    if (isQuiet) {
      emailSkipReason = "quiet_hours";
    } else {
      const { allowed, unreadCount } = await chatEmailAllowed(admin, row, userId);
      row.data.unread_count = unreadCount;
      if (!allowed) emailSkipReason = "batched";
    }
  }

  // Hebrew inflects what is said TO the reader, not just about them. One read,
  // shared by both channels below.
  const { data: recipientProfile } = await admin
    .from("profiles")
    .select("gender")
    .eq("user_id", userId)
    .maybeSingle();
  const to = formFor(recipientProfile?.gender);

  // ---- Email --------------------------------------------------------------
  if (!alreadyHandled.has("email")) {
    if (emailSkipReason) {
      await logDelivery(admin, notificationId, userId, "email", "skipped", emailSkipReason);
    } else {
      const { data: userResult } = await admin.auth.admin.getUserById(userId);
      const address = userResult?.user?.email;
      if (!address) {
        await logDelivery(admin, notificationId, userId, "email", "skipped", "no_address");
      } else {
        try {
          await sendEmail({ to: address, content: emailContent(row, to), tag: row.event_type });
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
    }
  }

  // ---- Parent contacts ----------------------------------------------------
  // Piggybacks on the email channel's idempotency marker rather than adding a
  // third one: `alreadyHandled` was read before the block above wrote to it, so
  // this runs exactly once per notification even when pg_net retries. It is
  // gated on the marker and not on whether the child's own email actually went
  // out — a child who muted their email has not muted their parent's.
  if (!alreadyHandled.has("email")) {
    await fanOutToParentContacts(admin, row, userId);
  }

  // ---- Push ---------------------------------------------------------------
  if (!alreadyHandled.has("push")) {
    if (!pushEnabled) {
      await logDelivery(admin, notificationId, userId, "push", "skipped", "disabled");
    } else if (!pushConfigured()) {
      await logDelivery(admin, notificationId, userId, "push", "skipped", "not_configured");
    } else if (isQuiet) {
      // The notification is still in the bell. For chat this is what the
      // morning digest later collects; for everything else the email already
      // went out and only the buzz is withheld.
      await logDelivery(admin, notificationId, userId, "push", "skipped", "quiet_hours");
    } else {
      const { data: subscriptions } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", userId);

      const payload = { ...pushPayload(row, to), notificationId };
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
