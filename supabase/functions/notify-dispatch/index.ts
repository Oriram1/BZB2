/**
 * The dispatcher: the single place that decides how a notification reaches a
 * person. Triggered by pg_net right after a row lands in `notifications`.
 *
 * Reads preferences, applies the batching and quiet-hours rules, sends on the
 * enabled channels, and records the outcome in `notification_deliveries`.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { readJsonObject, rejectWithoutSecret, serviceClient, json } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailContent, pushPayload } from "../_shared/notificationCopy.ts";
import { CHANNEL_DEFAULTS, type NotificationRow } from "../_shared/notificationEvents.ts";
import { formFor } from "../_shared/gender.ts";
import { pushConfigured, sendPush } from "../_shared/push.ts";
import { chatEmailAllowed } from "./chatEmail.ts";
import { inQuietWindow, israelHour, resolveQuietHours } from "../_shared/quietHours.ts";

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

  const denied = rejectWithoutSecret(req);
  if (denied) return denied;

  const admin = serviceClient();

  // Not wrapped by `withCors`/`errorResponse`, so a throw here would escape the
  // handler and become an unstructured 500 instead of the documented 400/413.
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_json";
    return json({ error: message }, message === "payload_too_large" ? 413 : 400);
  }

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

  // Payment-method changes are security confirmations, independent of marketing
  // or plan-change notification preferences.
  const cardUpdate = row.event_type === "billing_plan_changed" && row.data.kind === "card_updated";
  const emailEnabled = cardUpdate || (preference?.email_enabled ?? defaults.email);
  const pushEnabled = preference?.push_enabled ?? defaults.push;

  const quiet = resolveQuietHours(settings ?? null);
  const isQuiet = !cardUpdate && quiet.enabled && inQuietWindow(israelHour(new Date()), quiet.start, quiet.end);

  let emailSkipReason: string | null = emailEnabled ? null : "disabled";

  if (!emailSkipReason && row.event_type === "message_received") {
    const { allowed, unreadCount } = await chatEmailAllowed(admin, row, userId);
    row.data.unread_count = unreadCount;
    if (!allowed) emailSkipReason = "batched";
  }

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
