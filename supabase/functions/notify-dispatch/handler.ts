/**
 * The dispatcher: the single place that decides how a notification reaches a
 * person. Triggered by pg_net right after a row lands in `notifications`.
 *
 * Reads preferences, applies the batching and quiet-hours rules, sends on the
 * enabled channels, and records the outcome in `notification_deliveries`.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { json, type CronContext } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailContent, pushPayload } from "../_shared/notificationCopy.ts";
import { CHANNEL_DEFAULTS, type NotificationRow } from "../_shared/notificationEvents.ts";
import { formFor, type Form } from "../_shared/gender.ts";
import { childName, mailParentContact } from "../_shared/people.ts";
import { pushConfigured, sendPush } from "../_shared/push.ts";
import { inQuietWindow, resolveQuietHours } from "../_shared/quietHours.ts";
import { israelHour } from "../_shared/time.ts";
import { chatEmailAllowed } from "./chatEmail.ts";

type Delivery = {
  admin: SupabaseClient;
  row: NotificationRow;
  userId: string;
  to: Form;
  log: (channel: "email" | "push", status: "sent" | "failed" | "skipped", error?: string) => Promise<void>;
};

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

  const child = await childName(admin, userId);

  // One bad address must not stop the rest, and a failed send is only logged:
  // it must never fail the dispatch for the child themselves.
  for (const contact of contacts) {
    await mailParentContact(contact, mapping.event, {
      ...row.data,
      child_name: child.name,
      child_gender: child.gender,
    });
  }
}

async function deliverEmail({ admin, row, userId, to, log }: Delivery, skipReason: string | null) {
  if (skipReason) return await log("email", "skipped", skipReason);

  const { data: userResult } = await admin.auth.admin.getUserById(userId);
  const address = userResult?.user?.email;
  if (!address) return await log("email", "skipped", "no_address");

  try {
    await sendEmail({ to: address, content: emailContent(row, to), tag: row.event_type });
    await log("email", "sent");
  } catch (error) {
    await log("email", "failed", error instanceof Error ? error.message : "unknown");
  }
}

async function deliverPush(
  { admin, row, userId, to, log }: Delivery,
  skip: { enabled: boolean; quiet: boolean },
) {
  if (!skip.enabled) return await log("push", "skipped", "disabled");
  if (!pushConfigured()) return await log("push", "skipped", "not_configured");
  // The notification is still in the bell. For chat this is what the morning
  // digest later collects; for everything else the email already went out and
  // only the buzz is withheld.
  if (skip.quiet) return await log("push", "skipped", "quiet_hours");

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subscriptions?.length) return await log("push", "skipped", "no_devices");

  const payload = { ...pushPayload(row, to), notificationId: row.id };
  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendPush(subscription, payload);
      if (!result.ok && result.gone) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id);
      }
      return result;
    }),
  );

  const delivered = results.some((result) => result.ok);
  await log("push", delivered ? "sent" : "failed", delivered ? undefined : "all_endpoints_failed");
}

export async function dispatchNotification({ admin, body }: CronContext) {
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

  const to = formFor((await childName(admin, userId)).gender);

  const delivery: Delivery = {
    admin,
    row,
    userId,
    to,
    log: async (channel, status, error) => {
      await admin
        .from("notification_deliveries")
        .upsert(
          { notification_id: notificationId, user_id: userId, channel, status, error: error ?? null },
          { onConflict: "notification_id,channel" },
        );
    },
  };

  if (!alreadyHandled.has("email")) await deliverEmail(delivery, emailSkipReason);

  // Piggybacks on the email channel's idempotency marker rather than adding a
  // third one: `alreadyHandled` was read before the block above wrote to it, so
  // this runs exactly once per notification even when pg_net retries. It is
  // gated on the marker and not on whether the child's own email actually went
  // out — a child who muted their email has not muted their parent's.
  if (!alreadyHandled.has("email")) await fanOutToParentContacts(admin, row, userId);

  if (!alreadyHandled.has("push")) await deliverPush(delivery, { enabled: pushEnabled, quiet: isQuiet });

  return json({ ok: true });
}
