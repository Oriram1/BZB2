/**
 * Daily parent digest.
 *
 * pg_cron calls this every hour; each run only serves the parents who chose
 * that hour, which keeps per-user scheduling out of the database.
 *
 * Nothing happened today for any child → no notification at all. An empty
 * digest is noise, and noise is what makes people mute the whole channel.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const TIME_ZONE = "Asia/Jerusalem";
const DEFAULT_DIGEST_HOUR = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function israelParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

/** Local-midnight boundary for "today", expressed as a UTC instant. */
function dayStartUtc(date: string) {
  const offsetLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT+03:00";
  const offset = offsetLabel.replace("GMT", "") || "+03:00";
  return new Date(`${date}T00:00:00${offset}`);
}

async function buildChildCard(
  admin: SupabaseClient,
  childId: string,
  since: Date,
): Promise<{ title: string; lines: string[]; events: number; earned: number } | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", childId)
    .maybeSingle();

  const name = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "הילד/ה"
    : "הילד/ה";

  const { data: applications } = await admin
    .from("task_applications")
    .select("id, status, created_at, updated_at, task_id")
    .eq("applicant_id", childId)
    .gte("updated_at", since.toISOString());

  if (!applications?.length) return null;

  const taskIds = [...new Set(applications.map((row) => row.task_id))];
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, name, status, payment, payment_type, location")
    .in("id", taskIds);

  const taskById = new Map((tasks ?? []).map((task) => [task.id, task]));
  const lines: string[] = [];
  let earned = 0;

  for (const application of applications) {
    const task = taskById.get(application.task_id);
    if (!task) continue;

    const submittedToday = new Date(application.created_at) >= since;
    if (submittedToday) lines.push(`הגיש/ה מועמדות ל"${task.name}"`);

    if (application.status === "accepted") {
      lines.push(`התקבל/ה למטלה "${task.name}"${task.location ? ` — ${task.location}` : ""}`);
    } else if (application.status === "rejected" && !submittedToday) {
      lines.push(`המועמדות ל"${task.name}" לא התקבלה`);
    }

    if (task.status === "completed" && application.status === "accepted") {
      const amount = Number(task.payment) || 0;
      earned += amount;
      lines.push(`סיים/ה את "${task.name}"${amount ? ` — ₪${amount.toLocaleString("he-IL")}` : ""}`);
    }
  }

  if (!lines.length) return null;
  if (earned > 0) lines.push(`סה״כ היום: ₪${earned.toLocaleString("he-IL")}`);

  return { title: name, lines, events: lines.length, earned };
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
  const { date, hour } = israelParts();
  const since = dayStartUtc(date);

  const { data: links } = await admin.from("parent_links").select("parent_user_id, child_user_id");
  if (!links?.length) return json({ ok: true, sent: 0 });

  const childrenByParent = new Map<string, string[]>();
  for (const link of links) {
    const list = childrenByParent.get(link.parent_user_id) ?? [];
    list.push(link.child_user_id);
    childrenByParent.set(link.parent_user_id, list);
  }

  const parentIds = [...childrenByParent.keys()];
  const { data: settingsRows } = await admin
    .from("notification_settings")
    .select("user_id, digest_hour")
    .in("user_id", parentIds);

  const hourByParent = new Map((settingsRows ?? []).map((row) => [row.user_id, row.digest_hour]));

  let sent = 0;
  for (const parentId of parentIds) {
    if ((hourByParent.get(parentId) ?? DEFAULT_DIGEST_HOUR) !== hour) continue;

    const cards = [];
    for (const childId of childrenByParent.get(parentId) ?? []) {
      const card = await buildChildCard(admin, childId, since);
      if (card) cards.push(card);
    }
    if (!cards.length) continue;

    const totalEarned = cards.reduce((sum, card) => sum + card.earned, 0);
    const summary = cards.length === 1
      ? `${cards[0].title}: ${cards[0].events} עדכונים היום`
      : `${cards.length} ילדים, ${cards.reduce((sum, card) => sum + card.events, 0)} עדכונים היום`;

    await admin.from("notifications").insert({
      user_id: parentId,
      event_type: "parent_digest",
      data: {
        date,
        summary,
        total_earned: totalEarned,
        cards: cards.map(({ title, lines }) => ({ title, lines })),
      },
      link: `/parent/report/${date}`,
    });
    sent += 1;
  }

  return json({ ok: true, hour, date, sent });
});
