/**
 * Daily parent digest.
 *
 * pg_cron calls this every hour; each run only serves the parents who chose
 * that hour, which keeps per-user scheduling out of the database.
 *
 * Nothing happened today for any child → no notification at all. An empty
 * digest is noise, and noise is what makes people mute the whole channel.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { json, type CronContext } from "../_shared/auth.ts";
import { digestAlreadySent } from "../_shared/digest.ts";
import { formFor, say, SUBJECT } from "../_shared/gender.ts";
import { childName, mailParentContact } from "../_shared/people.ts";
import { dayStart, israelParts } from "../_shared/time.ts";

const DEFAULT_DIGEST_HOUR = 20;

type ChildCard = { title: string; lines: string[]; events: number; earned: number };

async function buildChildCard(admin: SupabaseClient, childId: string, since: Date): Promise<ChildCard | null> {
  const child = await childName(admin, childId);
  const kid = formFor(child.gender);
  const name = child.name || say(kid, SUBJECT.child);

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
    if (submittedToday) lines.push(`${say(kid, SUBJECT.submitted)} מועמדות ל"${task.name}"`);

    if (application.status === "accepted") {
      lines.push(`${say(kid, SUBJECT.accepted)} למטלה "${task.name}"${task.location ? ` — ${task.location}` : ""}`);
    } else if (application.status === "rejected" && !submittedToday) {
      lines.push(`המועמדות ל"${task.name}" לא התקבלה`);
    }

    if (task.status === "completed" && application.status === "accepted") {
      const amount = Number(task.payment) || 0;
      earned += amount;
      lines.push(`${say(kid, SUBJECT.finished)} את "${task.name}"${amount ? ` — ₪${amount.toLocaleString("he-IL")}` : ""}`);
    }
  }

  if (!lines.length) return null;
  if (earned > 0) lines.push(`סה״כ היום: ₪${earned.toLocaleString("he-IL")}`);

  return { title: name, lines, events: lines.length, earned };
}

export async function sendParentDigests({ admin }: CronContext) {
  const { date, hour } = israelParts(new Date());
  const since = dayStart(date);

  // A child can appear in several parents' digests and on several contacts' emails.
  const cards = new Map<string, Promise<ChildCard | null>>();
  const cardFor = (childId: string) => {
    if (!cards.has(childId)) cards.set(childId, buildChildCard(admin, childId, since));
    return cards.get(childId)!;
  };

  const { data: links } = await admin.from("parent_links").select("parent_user_id, child_user_id");

  const childrenByParent = new Map<string, string[]>();
  for (const link of links ?? []) {
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
  let failed = 0;
  for (const parentId of parentIds) {
    if ((hourByParent.get(parentId) ?? DEFAULT_DIGEST_HOUR) !== hour) continue;

    try {
      if (await digestAlreadySent(admin, parentId, "parent_digest", date)) continue;

      const childCards = (await Promise.all((childrenByParent.get(parentId) ?? []).map(cardFor)))
        .filter((card): card is ChildCard => card !== null);
      if (!childCards.length) continue;

      const summary = childCards.length === 1
        ? `${childCards[0].title}: ${childCards[0].events} עדכונים היום`
        : `${childCards.length} ילדים, ${childCards.reduce((sum, card) => sum + card.events, 0)} עדכונים היום`;

      await admin.from("notifications").insert({
        user_id: parentId,
        event_type: "parent_digest",
        data: {
          date,
          summary,
          total_earned: childCards.reduce((sum, card) => sum + card.earned, 0),
          cards: childCards.map(({ title, lines }) => ({ title, lines })),
        },
        // No parent dashboard exists any more, so there is no report page to open.
        link: null,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("parent_digest_failed", { parentId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Parent contacts have no account, so none of the above reaches them: no
  // notifications row to insert (it is keyed by user_id) and no digest_hour to
  // read. They are mailed directly, on the default hour, which is the only hour
  // they have any way of choosing.
  let contactsSent = 0;
  if (hour === DEFAULT_DIGEST_HOUR) {
    const { data: contacts } = await admin
      .from("parent_contacts")
      .select("id, email, child_user_id, view_token")
      .eq("notify_digest", true);

    for (const contact of contacts ?? []) {
      try {
        const card = await cardFor(contact.child_user_id);
        if (!card) continue;

        const emailed = await mailParentContact(contact, "parent_digest", {
          date,
          summary: `${card.title}: ${card.events} עדכונים היום`,
          total_earned: card.earned,
          cards: [{ title: card.title, lines: card.lines }],
        });
        if (emailed) contactsSent += 1;
      } catch (error) {
        failed += 1;
        console.error("parent_contact_digest_failed", { contactId: contact.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return json({ ok: true, hour, date, sent, contactsSent, failed });
}
