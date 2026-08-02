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
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { siteUrl } from "../_shared/email.ts";
import {
  buildDigestCards,
  inQuietWindow,
  israelDate,
  israelHour,
  quietWindowStart,
  resolveQuietHours,
  type HeldNotification,
} from "../_shared/quietHours.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Held-back chat notifications for one user: unread, inside the window that
 * just closed, and logged by the dispatcher as skipped for quiet hours.
 */
async function heldMessages(
  admin: SupabaseClient,
  userId: string,
  since: Date,
): Promise<HeldNotification[]> {
  const { data: notifications } = await admin
    .from("notifications")
    .select("id, data")
    .eq("user_id", userId)
    .eq("event_type", "message_received")
    .is("read_at", null)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);

  if (!notifications?.length) return [];

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

/** One digest per user per day, however many times the cron retries. */
async function alreadySent(admin: SupabaseClient, userId: string, date: string) {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", "quiet_hours_digest")
    .eq("data->>date", date)
    .limit(1);
  return (data ?? []).length > 0;
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
  const onlyUser = body.user_id ? String(body.user_id) : null;
  const force = body.force === true;

  const now = new Date();
  const hour = israelHour(now);
  const date = israelDate(now);
  const base = siteUrl();

  // Candidates are everyone who was sent a held-back chat notification, which
  // is a far smaller set than every user and needs no separate roster.
  const { data: candidates } = await admin
    .from("notification_deliveries")
    .select("user_id")
    .eq("channel", "push")
    .eq("error", "quiet_hours")
    .gte("created_at", new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString());

  let userIds = [...new Set((candidates ?? []).map((row) => row.user_id as string))];
  if (onlyUser) userIds = userIds.filter((id) => id === onlyUser);
  if (!userIds.length) return json({ ok: true, hour, date, sent: 0 });

  const { data: settingsRows } = await admin
    .from("notification_settings")
    .select("user_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
    .in("user_id", userIds);

  const settingsByUser = new Map((settingsRows ?? []).map((row) => [row.user_id, row]));

  let sent = 0;
  for (const userId of userIds) {
    const quiet = resolveQuietHours(settingsByUser.get(userId) ?? null);
    if (!quiet.enabled) continue;
    // The digest is due exactly when the window ends. `force` is the manual
    // test hook — without it, verifying a change means waiting for 07:00.
    if (!force && hour !== quiet.end) continue;
    if (await alreadySent(admin, userId, date)) continue;

    const since = quietWindowStart(now, quiet.start, quiet.end);
    // A forced run mid-window would otherwise find nothing, because the window
    // it computes has not started yet.
    const from = force && inQuietWindow(hour, quiet.start, quiet.end)
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : since;

    const rows = await heldMessages(admin, userId, from);
    if (!rows.length) continue;

    const cards = buildDigestCards(rows, base);
    await admin.from("notifications").insert({
      user_id: userId,
      event_type: "quiet_hours_digest",
      data: { date, total: rows.length, cards },
      link: "/chat",
    });
    sent += 1;
  }

  return json({ ok: true, hour, date, sent });
});
