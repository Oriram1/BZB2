/**
 * The morning after.
 *
 * Quiet hours withhold chat notifications overnight; this collects what was
 * withheld and posts a single summary once the window ends. pg_cron calls it
 * every hour and each run serves only the users whose quiet hours end at that
 * hour, which keeps per-user scheduling out of the database.
 *
 * Nothing was withheld → no notification. An empty digest is noise, and noise
 * is what makes people mute a channel.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { siteUrl } from "../_shared/email.ts";
import { json, type CronContext } from "../_shared/auth.ts";
import { digestAlreadySent } from "../_shared/digest.ts";
import {
  buildDigestCards,
  quietWindowStart,
  resolveQuietHours,
  type HeldNotification,
} from "../_shared/quietHours.ts";
import { HOUR_MS, israelDate, israelHour } from "../_shared/time.ts";

const HELD_PAGE_SIZE = 1000;
/** How far back a push skipped for quiet hours can still be waiting for its digest. */
const HELD_LOOKBACK_MS = 36 * HOUR_MS;

/**
 * Held-back chat notifications for one user: unread, inside the window that
 * just closed, and logged by the dispatcher as skipped for quiet hours.
 */
async function heldMessages(
  admin: SupabaseClient,
  userId: string,
  since: Date,
): Promise<HeldNotification[]> {
  const notifications: { id: string; data: Record<string, unknown> }[] = [];
  for (let from = 0; ; from += HELD_PAGE_SIZE) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, data")
      .eq("user_id", userId)
      .eq("event_type", "message_received")
      .is("read_at", null)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .range(from, from + HELD_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as { id: string; data: Record<string, unknown> }[];
    notifications.push(...page);
    if (page.length < HELD_PAGE_SIZE) break;
  }

  if (!notifications.length) return [];

  const { data: deliveries } = await admin
    .from("notification_deliveries")
    .select("notification_id")
    .eq("channel", "push")
    .eq("error", "quiet_hours")
    .in("notification_id", notifications.map((row) => row.id));

  const held = new Set((deliveries ?? []).map((row) => row.notification_id));

  return notifications
    .filter((row) => held.has(row.id))
    .map((row) => ({
      conversation_id: String((row.data ?? {}).conversation_id ?? ""),
      sender_name: String((row.data ?? {}).sender_name ?? "משתמש"),
    }))
    .filter((row) => row.conversation_id);
}

export async function sendQuietDigests({ admin }: CronContext) {
  const now = new Date();
  const hour = israelHour(now);
  const date = israelDate(now);
  const base = siteUrl();

  const { data: candidates } = await admin
    .from("notification_deliveries")
    .select("user_id")
    .eq("channel", "push")
    .eq("error", "quiet_hours")
    .gte("created_at", new Date(now.getTime() - HELD_LOOKBACK_MS).toISOString());

  const userIds = [...new Set((candidates ?? []).map((row) => row.user_id as string))];
  if (!userIds.length) return json({ ok: true, hour, date, sent: 0 });

  const { data: settingsRows } = await admin
    .from("notification_settings")
    .select("user_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
    .in("user_id", userIds);

  const settingsByUser = new Map((settingsRows ?? []).map((row) => [row.user_id, row]));

  let sent = 0;
  for (const userId of userIds) {
    const quiet = resolveQuietHours(settingsByUser.get(userId) ?? null);
    // The digest is due exactly when the window ends.
    if (!quiet.enabled || hour !== quiet.end) continue;
    if (await digestAlreadySent(admin, userId, "quiet_hours_digest", date)) continue;

    const rows = await heldMessages(admin, userId, quietWindowStart(now, quiet.start, quiet.end));
    if (!rows.length) continue;

    await admin.from("notifications").insert({
      user_id: userId,
      event_type: "quiet_hours_digest",
      data: { date, total: rows.length, cards: buildDigestCards(rows, base) },
      link: "/chat",
    });
    sent += 1;
  }

  return json({ ok: true, hour, date, sent });
}
